import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_MIGRATION_TRANSITIONS,
  assertFinalMigrationList,
  assertInitialMigrationList,
  assertPhaseDryRunPlan,
  assertSupabaseCliVersion,
  createPhaseWorkdir,
  EXPECTED_FINAL_MIGRATION_VERSION,
  EXPECTED_MIGRATION_COUNT,
  migrationPrefixThrough,
  parseReplayArguments,
  PROTECTED_PROJECT_REFS,
  readMigrationInventory,
  removePhaseWorkdir,
  runStagingMigrationReplay,
  StagingMigrationReplayFailure,
  validateCleanCandidate,
} from "../../../scripts/replay-blank-staging-migrations.mjs";

const SHA = "a".repeat(40);
const NEW_STAGING_REF = "abcdefghijklmnopqrst";
const APPROVED_CLI_VERSION = "2.0.0";
const FIRST_THROUGH = "20260827125500";
const BLOB_SHA = "b".repeat(40);

function argumentsFor({
  current = null as string | null,
  through = FIRST_THROUGH,
  gate = null as string | null,
  projectRef = NEW_STAGING_REF,
} = {}) {
  const args = [
    "--project-ref",
    projectRef,
    "--expected-project-ref",
    projectRef,
    "--candidate-sha",
    SHA,
    "--expected-current-version",
    current ?? "none",
    "--through-version",
    through,
    "--approved-cli-version",
    APPROVED_CLI_VERSION,
  ];
  if (current === null) {
    args.push(
      "--blank-preflight-attestation",
      `${projectRef}:zero-auth-users:zero-public-tables:zero-ledger-rows`,
    );
  } else if (gate) {
    args.push("--phase-gate-attestation", gate);
  }
  args.push("--apply");
  return args;
}

function migrationTable(
  localMigrations: Array<{ version: string }>,
  remoteMigrations: Array<{ version: string }>,
) {
  const remote = new Set(remoteMigrations.map(({ version }) => version));
  return [
    "Local          | Remote         | Time (UTC)",
    "---------------|----------------|---------------------",
    ...localMigrations.map(({ version }) => (
      ` ${version} | ${remote.has(version) ? version : ""} | 2026-08-27 00:00:00`
    )),
  ].join("\n");
}

function reviewedDryRun(migrations: Array<{ file: string }>, extraLines: string[] = []) {
  return [
    "DRY RUN: migrations will *not* be pushed to the database.",
    "Connecting to remote database...",
    "Would you like to push these migrations to the remote database?",
    ...migrations.map(({ file }) => ` • ${file}`),
    ...extraLines,
    "Finished supabase db push.",
  ].join("\n");
}

function gitResult(
  command: string,
  args: string[],
  migrations: Array<{ path: string }>,
) {
  if (command !== "git") return null;
  if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
    return { output: process.cwd() };
  }
  if (args[0] === "status") return { output: "" };
  if (args[0] === "rev-parse") {
    return { output: args[1]?.includes(":supabase/migrations/") ? BLOB_SHA : SHA };
  }
  if (args[0] === "ls-files") {
    return { output: migrations.map(({ path }) => path).join("\n") };
  }
  if (args[0] === "hash-object") return { output: BLOB_SHA };
  return { output: "" };
}

describe("phased staging migration replay", () => {
  const migrations = readMigrationInventory();

  it("locks the rollout to the exact authoritative transition graph", () => {
    expect(ALLOWED_MIGRATION_TRANSITIONS).toEqual([
      { current: null, through: "20260827125500", gate: null },
      {
        current: "20260827125500",
        through: "20260827126000",
        gate: "writes-paused-edge-deployed-tested-drained",
      },
      {
        current: "20260827126000",
        through: "20260827126500",
        gate: "writes-paused-agreement-migration-verified",
      },
      {
        current: "20260827126500",
        through: "20260827126750",
        gate: "writes-paused-raw-input-guard-verified",
      },
      {
        current: "20260827126750",
        through: "20260827127500",
        gate: "writes-paused-agreement-ui-canaries-passed",
      },
      {
        current: "20260827127500",
        through: "20260827130000",
        gate: "writes-paused-mirror-retirement-verified",
      },
      {
        current: "20260827130000",
        through: "20260827132000",
        gate: "writes-paused-capture-lockdown-verified",
      },
      {
        current: "20260827132000",
        through: "20260827133000",
        gate: "writes-paused-storage-integrity-verified",
      },
      {
        current: "20260827133000",
        through: "20260827134000",
        gate: "writes-paused-learning-evidence-guard-verified",
      },
      {
        current: "20260827134000",
        through: "20260827135000",
        gate: "writes-paused-class-owner-scope-verified",
      },
      {
        current: "20260827135000",
        through: "20260827140000",
        gate: "writes-paused-launch-schema-regression-verified",
      },
      {
        current: "20260827140000",
        through: "20260828100000",
        gate: "writes-paused-onboarding-owner-guard-verified",
      },
      {
        current: "20260828100000",
        through: "20260828110000",
        gate: "writes-paused-evidence-contract-edge-deployed-verified",
      },
    ]);
    expect(() => parseReplayArguments(argumentsFor({
      current: "20260827125500",
      through: "20260827126500",
      gate: "writes-paused-edge-deployed-tested-drained",
    }))).toThrow("not one allowed rollout transition");
    const parsed = parseReplayArguments(argumentsFor());
    expect(() => runStagingMigrationReplay({
      ...parsed,
      throughVersion: EXPECTED_FINAL_MIGRATION_VERSION,
    }, {
      runCommand: vi.fn(),
      inventory: migrations,
    })).toThrow("one fully validated, attested, allowed transition");
  });

  it("requires the operator's blank-target attestation only for phase one and exact later gates", () => {
    expect(parseReplayArguments(argumentsFor())).toMatchObject({
      expectedCurrentVersion: null,
      throughVersion: FIRST_THROUGH,
      blankPreflightAttestation: `${NEW_STAGING_REF}:zero-auth-users:zero-public-tables:zero-ledger-rows`,
      phaseGateAttestation: null,
    });
    const transition = ALLOWED_MIGRATION_TRANSITIONS[1];
    expect(parseReplayArguments(argumentsFor({
      current: transition.current,
      through: transition.through,
      gate: transition.gate,
    }))).toMatchObject({
      expectedCurrentVersion: transition.current,
      throughVersion: transition.through,
      phaseGateAttestation: transition.gate,
      blankPreflightAttestation: null,
    });
    expect(() => parseReplayArguments(argumentsFor({
      current: transition.current,
      through: transition.through,
    }))).toThrow("--phase-gate-attestation must exactly equal");
    expect(() => parseReplayArguments(
      argumentsFor().filter((value) => !value.includes("zero-auth-users")),
    )).toThrow();
  });

  it("rejects every protected or quarantined project and hard-codes no writable ref", () => {
    expect(PROTECTED_PROJECT_REFS).toEqual([
      "norsaaoyppctrvxxgjtg",
      "dfpgnmldxphkfmobjbvr",
      "lzwaiobgrhwmywugsgjo",
      "mviunlhhtcjuuburjxbf",
    ]);
    for (const projectRef of PROTECTED_PROJECT_REFS) {
      expect(() => parseReplayArguments(argumentsFor({ projectRef }))).toThrow("is forbidden");
    }
    expect(PROTECTED_PROJECT_REFS).not.toContain(NEW_STAGING_REF);
  });

  it("validates the complete 63-file canonical candidate before taking a prefix", () => {
    expect(migrations).toHaveLength(EXPECTED_MIGRATION_COUNT);
    expect(new Set(migrations.map(({ version }) => version))).toHaveLength(EXPECTED_MIGRATION_COUNT);
    expect(migrations.at(-1)?.version).toBe(EXPECTED_FINAL_MIGRATION_VERSION);
    expect(migrationPrefixThrough(migrations, FIRST_THROUGH)).toHaveLength(51);

    const dirtyRunner = vi.fn((command: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { output: process.cwd() };
      if (args[0] === "status") return { output: "?? unreviewed.sql" };
      return { output: "" };
    });
    expect(() => validateCleanCandidate(
      parseReplayArguments(argumentsFor()),
      migrations,
      dirtyRunner,
    )).toThrow("repository must be completely clean");
  });

  it("compares every working migration blob with candidate HEAD even when status is clean", () => {
    const changedPath = migrations[12].path;
    const runner = vi.fn((command: string, args: string[]) => {
      const result = gitResult(command, args, migrations);
      if (!result) return { output: "" };
      if (args[0] === "hash-object" && args.at(-1) === changedPath) {
        return { output: "c".repeat(40) };
      }
      return result;
    });

    expect(() => validateCleanCandidate(
      parseReplayArguments(argumentsFor()),
      migrations,
      runner,
    )).toThrow(`working migration bytes do not match the candidate commit for ${changedPath}`);
    expect(runner).toHaveBeenCalledWith(
      "git",
      ["hash-object", "--no-filters", "--", changedPath],
      expect.objectContaining({ capture: true }),
    );
  });

  it("copies only a byte-exact migration prefix and removes only its explicit mkdtemp", () => {
    const prefix = migrations.slice(0, 3);
    const workdir = createPhaseWorkdir(process.cwd(), prefix);
    try {
      const copied = readdirSync(join(workdir, "supabase/migrations")).sort();
      expect(copied).toEqual(prefix.map(({ file }) => file).sort());
      for (const migration of prefix) {
        expect(readFileSync(join(workdir, "supabase/migrations", migration.file)))
          .toEqual(readFileSync(migration.path));
      }
      expect(() => removePhaseWorkdir(process.cwd())).toThrow("refusing to remove");
    } finally {
      removePhaseWorkdir(workdir);
    }
    expect(existsSync(workdir)).toBe(false);
  });

  it("requires an initial remote ledger equal to the prior prefix and a final aligned phase prefix", () => {
    const phase = migrationPrefixThrough(migrations, "20260827126000");
    const current = migrationPrefixThrough(migrations, FIRST_THROUGH);
    expect(() => assertInitialMigrationList(migrationTable(phase, current), phase, current)).not.toThrow();
    expect(() => assertFinalMigrationList(migrationTable(phase, phase), phase)).not.toThrow();

    const remoteAhead = migrationTable(phase, phase);
    expect(() => assertInitialMigrationList(remoteAhead, phase, current))
      .toThrow("unexpected, unaligned, or remote-only ledger row");
    expect(() => assertInitialMigrationList(
      `${migrationTable(phase, current)}\n               | 19990101000000 |`,
      phase,
      current,
    )).toThrow("row count does not match");
    expect(() => assertFinalMigrationList(migrationTable(phase, current), phase))
      .toThrow("unexpected, unaligned, or remote-only ledger row");
  });

  it("accepts only the reviewed dry-run headings and bullet filename rows", () => {
    const phase = migrationPrefixThrough(migrations, "20260827126000");
    const current = migrationPrefixThrough(migrations, FIRST_THROUGH);
    const pending = phase.slice(current.length);
    expect(() => assertPhaseDryRunPlan(reviewedDryRun(pending), pending)).not.toThrow();
    expect(() => assertPhaseDryRunPlan(pending[0].version, pending))
      .toThrow("reviewed Supabase dry-run");
    expect(() => assertPhaseDryRunPlan(
      reviewedDryRun(pending, [`WARNING: skipped ${pending[0].file}`]),
      pending,
    )).toThrow("must not contain a warning or skipped-migration marker");
    expect(() => assertPhaseDryRunPlan(
      reviewedDryRun(pending, ["WARNING: migration output may be incomplete"]),
      pending,
    )).toThrow("must not contain a warning or skipped-migration marker");
    expect(() => assertPhaseDryRunPlan(
      reviewedDryRun(pending).replace(` • ${pending[0].file}`, `Skipping migration ${pending[0].file}`),
      pending,
    )).toThrow("must not contain a warning or skipped-migration marker");
    expect(() => assertPhaseDryRunPlan(
      reviewedDryRun(pending).replace(pending[0].file, `${pending[0].version}_wrong_name.sql`),
      pending,
    )).toThrow("do not exactly equal");
    const orderedPair = migrations.slice(0, 2);
    expect(() => assertPhaseDryRunPlan(reviewedDryRun([...orderedPair].reverse()), orderedPair))
      .toThrow("do not exactly equal");
    expect(() => assertSupabaseCliVersion(APPROVED_CLI_VERSION, APPROVED_CLI_VERSION)).not.toThrow();
    expect(() => assertSupabaseCliVersion("2.0.1", APPROVED_CLI_VERSION))
      .toThrow("does not exactly match");
  });

  it("uses a phase-only workdir for link/list/dry-run/push/list and never deploys or repairs", () => {
    const transition = ALLOWED_MIGRATION_TRANSITIONS[1];
    const config = parseReplayArguments(argumentsFor({
      current: transition.current,
      through: transition.through,
      gate: transition.gate,
    }));
    const phase = migrationPrefixThrough(migrations, transition.through);
    const current = migrationPrefixThrough(migrations, transition.current!);
    const pending = phase.slice(current.length);
    const phaseWorkdir = "/tmp/campus-companion-migration-phase-test";
    const commands: Array<{ command: string; args: string[]; cwd?: string }> = [];
    let migrationListCalls = 0;
    const runCommand = vi.fn((command: string, args: string[], options?: { cwd?: string }) => {
      const git = gitResult(command, args, migrations);
      if (git) return git;
      commands.push({ command, args, cwd: options?.cwd });
      if (args[0] === "--version") return { output: APPROVED_CLI_VERSION };
      if (args[0] === "migration") {
        migrationListCalls += 1;
        return {
          output: migrationListCalls === 1
            ? migrationTable(phase, current)
            : migrationTable(phase, phase),
        };
      }
      if (args.includes("--dry-run")) return { output: reviewedDryRun(pending) };
      return { output: "" };
    });
    const makeWorkdir = vi.fn(() => phaseWorkdir);
    const removeWorkdir = vi.fn();

    runStagingMigrationReplay(config, {
      runCommand,
      log: vi.fn(),
      inventory: migrations,
      makeWorkdir,
      removeWorkdir,
      verifyLinkedProject: vi.fn(),
    });

    expect(makeWorkdir).toHaveBeenCalledWith(process.cwd(), phase);
    expect(removeWorkdir).toHaveBeenCalledExactlyOnceWith(phaseWorkdir);
    const supabaseCommands = commands.filter(({ command }) => command === "supabase");
    expect(supabaseCommands.map(({ args }) => args)).toEqual([
      ["--version"],
      ["link", "--project-ref", NEW_STAGING_REF],
      ["migration", "list", "--linked"],
      ["db", "push", "--linked", "--include-all", "--dry-run", "--yes"],
      ["db", "push", "--linked", "--include-all", "--yes"],
      ["migration", "list", "--linked"],
    ]);
    expect(supabaseCommands.slice(1).every(({ cwd }) => cwd === phaseWorkdir)).toBe(true);
    expect(supabaseCommands.flatMap(({ args }) => args)).not.toContain("functions");
    expect(supabaseCommands.flatMap(({ args }) => args)).not.toContain("repair");
  });

  it("stops before push on ledger/dry-run drift and always removes the temporary workdir", () => {
    const config = parseReplayArguments(argumentsFor());
    const phase = migrationPrefixThrough(migrations, FIRST_THROUGH);
    const removeWorkdir = vi.fn();
    const runCommand = vi.fn((command: string, args: string[]) => {
      const git = gitResult(command, args, migrations);
      if (git) return git;
      if (args[0] === "--version") return { output: APPROVED_CLI_VERSION };
      if (args[0] === "migration") return { output: migrationTable(phase, []) };
      if (args.includes("--dry-run")) return { output: phase[0].version };
      return { output: "" };
    });

    expect(() => runStagingMigrationReplay(config, {
      runCommand,
      log: vi.fn(),
      inventory: migrations,
      makeWorkdir: vi.fn(() => "/tmp/campus-companion-migration-phase-test"),
      removeWorkdir,
      verifyLinkedProject: vi.fn(),
    })).toThrow("reviewed Supabase dry-run");
    expect(runCommand).not.toHaveBeenCalledWith(
      "supabase",
      ["db", "push", "--linked", "--include-all", "--yes"],
      expect.anything(),
    );
    expect(removeWorkdir).toHaveBeenCalledOnce();
  });

  it("preserves quarantine as primary when cleanup also fails after a push attempt", () => {
    const config = parseReplayArguments(argumentsFor());
    const phase = migrationPrefixThrough(migrations, FIRST_THROUGH);
    const removeWorkdir = vi.fn(() => {
      throw new Error("simulated cleanup failure");
    });
    const runCommand = vi.fn((command: string, args: string[]) => {
      const git = gitResult(command, args, migrations);
      if (git) return git;
      if (args[0] === "--version") return { output: APPROVED_CLI_VERSION };
      if (args[0] === "migration") return { output: migrationTable(phase, []) };
      if (args.includes("--dry-run")) return { output: reviewedDryRun(phase) };
      if (args[0] === "db" && args[1] === "push") throw new Error("simulated push failure");
      return { output: "" };
    });

    let failure: unknown;
    try {
      runStagingMigrationReplay(config, {
        runCommand,
        log: vi.fn(),
        inventory: migrations,
        makeWorkdir: vi.fn(() => "/tmp/campus-companion-migration-phase-test"),
        removeWorkdir,
        verifyLinkedProject: vi.fn(),
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(StagingMigrationReplayFailure);
    expect(failure).toMatchObject({ check: "migration-push" });
    expect((failure as Error).message).toContain("quarantine and discard this target");
    expect((failure as Error).message).toContain("secondary cleanup failure");
    expect(removeWorkdir).toHaveBeenCalledOnce();
  });
});
