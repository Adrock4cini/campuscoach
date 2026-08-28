import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_MIGRATION_COUNT = 63;
export const EXPECTED_FINAL_MIGRATION_VERSION = "20260828110000";
export const PROTECTED_PROJECT_REFS = Object.freeze([
  "norsaaoyppctrvxxgjtg", // production
  "dfpgnmldxphkfmobjbvr", // previous Family Beta
  "lzwaiobgrhwmywugsgjo", // abandoned remixed staging
  "mviunlhhtcjuuburjxbf", // quarantined after nondeterministic Lovable replay
]);
export const ALLOWED_MIGRATION_TRANSITIONS = Object.freeze([
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
].map((transition) => Object.freeze(transition)));

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const MIGRATION_VERSION_PATTERN = /^\d{14}$/u;
const MIGRATION_FILE_PATTERN = /^(\d{14})_[a-z0-9_-]+\.sql$/u;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const GIT_BLOB_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const CLI_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const BLANK_PREFLIGHT_SUFFIX = ":zero-auth-users:zero-public-tables:zero-ledger-rows";
const TEMPORARY_WORKDIR_PREFIX = "campus-companion-migration-phase-";
const CREATED_PHASE_WORKDIRS = new Set();
const REVIEWED_DRY_RUN_HEADING = "DRY RUN: migrations will *not* be pushed to the database.";
const REVIEWED_MIGRATION_PLAN_HEADING = "Would you like to push these migrations to the remote database?";
const REVIEWED_MIGRATION_FILENAME_ROW = /^\s*•\s+((\d{14})_[a-z0-9_-]+\.sql)\s*$/u;

export class StagingMigrationReplayFailure extends Error {
  constructor(check, reason) {
    super(`${check}: ${reason}`);
    this.name = "StagingMigrationReplayFailure";
    this.check = check;
  }
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new StagingMigrationReplayFailure("arguments", `${name} is required`);
  }
  return value;
}

function findTransition(current, through) {
  return ALLOWED_MIGRATION_TRANSITIONS.find((transition) => (
    transition.current === current && transition.through === through
  ));
}

function assertRuntimeConfiguration(config) {
  const transition = findTransition(config.expectedCurrentVersion, config.throughVersion);
  const firstPhaseAttestation = `${config.projectRef}${BLANK_PREFLIGHT_SUFFIX}`;
  if (
    !PROJECT_REF_PATTERN.test(config.projectRef)
    || PROTECTED_PROJECT_REFS.includes(config.projectRef)
    || config.expectedProjectRef !== config.projectRef
    || !FULL_SHA_PATTERN.test(config.candidateSha)
    || !CLI_VERSION_PATTERN.test(config.approvedCliVersion)
    || !transition
    || config.apply !== true
    || (
      transition.current === null
        ? (
          config.blankPreflightAttestation !== firstPhaseAttestation
          || config.phaseGateAttestation !== null
        )
        : (
          config.blankPreflightAttestation !== null
          || config.phaseGateAttestation !== transition.gate
        )
    )
  ) {
    throw new StagingMigrationReplayFailure(
      "runtime-configuration",
      "phase execution requires one fully validated, attested, allowed transition",
    );
  }
}

export function parseReplayArguments(argv) {
  const options = new Map();
  const allowedValueOptions = new Set([
    "--project-ref",
    "--expected-project-ref",
    "--candidate-sha",
    "--expected-current-version",
    "--through-version",
    "--blank-preflight-attestation",
    "--phase-gate-attestation",
    "--approved-cli-version",
  ]);
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      if (apply) {
        throw new StagingMigrationReplayFailure("arguments", "--apply may appear only once");
      }
      apply = true;
      continue;
    }
    if (!allowedValueOptions.has(argument)) {
      throw new StagingMigrationReplayFailure("arguments", `unknown option ${argument}`);
    }
    if (options.has(argument)) {
      throw new StagingMigrationReplayFailure("arguments", `${argument} may appear only once`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new StagingMigrationReplayFailure("arguments", `${argument} requires a value`);
    }
    options.set(argument, value);
    index += 1;
  }

  const projectRef = requiredOption(options, "--project-ref");
  const expectedProjectRef = requiredOption(options, "--expected-project-ref");
  const candidateSha = requiredOption(options, "--candidate-sha").toLowerCase();
  const expectedCurrentArgument = requiredOption(options, "--expected-current-version");
  const throughVersion = requiredOption(options, "--through-version");
  const approvedCliVersion = requiredOption(options, "--approved-cli-version");
  const expectedCurrentVersion = expectedCurrentArgument === "none"
    ? null
    : expectedCurrentArgument;

  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new StagingMigrationReplayFailure("arguments", "--project-ref must be a 20-character Supabase project ref");
  }
  if (PROTECTED_PROJECT_REFS.includes(projectRef)) {
    throw new StagingMigrationReplayFailure(
      "target",
      "the requested project ref is production, prior beta, abandoned, or quarantined and is forbidden",
    );
  }
  if (expectedProjectRef !== projectRef) {
    throw new StagingMigrationReplayFailure(
      "target",
      "--expected-project-ref must repeat the exact --project-ref",
    );
  }
  if (!FULL_SHA_PATTERN.test(candidateSha)) {
    throw new StagingMigrationReplayFailure("arguments", "--candidate-sha must be a full 40-character git commit SHA");
  }
  if (
    (expectedCurrentVersion !== null && !MIGRATION_VERSION_PATTERN.test(expectedCurrentVersion))
    || !MIGRATION_VERSION_PATTERN.test(throughVersion)
  ) {
    throw new StagingMigrationReplayFailure(
      "arguments",
      "migration versions must be 14 digits; use none only for the first phase",
    );
  }
  if (!CLI_VERSION_PATTERN.test(approvedCliVersion)) {
    throw new StagingMigrationReplayFailure(
      "arguments",
      "--approved-cli-version must be the exact reviewed stable CLI version in x.y.z form",
    );
  }

  const transition = findTransition(expectedCurrentVersion, throughVersion);
  if (!transition) {
    throw new StagingMigrationReplayFailure(
      "phase-transition",
      "expected-current-version and through-version are not one allowed rollout transition",
    );
  }

  const blankPreflightAttestation = options.get("--blank-preflight-attestation") ?? null;
  const phaseGateAttestation = options.get("--phase-gate-attestation") ?? null;
  if (transition.current === null) {
    if (blankPreflightAttestation !== `${projectRef}${BLANK_PREFLIGHT_SUFFIX}`) {
      throw new StagingMigrationReplayFailure(
        "target",
        "the first phase requires an exact zero-user, zero-table, zero-ledger attestation for this ref",
      );
    }
    if (phaseGateAttestation !== null) {
      throw new StagingMigrationReplayFailure(
        "phase-transition",
        "the first phase must not use a later phase-gate attestation",
      );
    }
  } else {
    if (blankPreflightAttestation !== null) {
      throw new StagingMigrationReplayFailure(
        "phase-transition",
        "blank-target attestation is valid only for the none-to-20260827125500 phase",
      );
    }
    if (phaseGateAttestation !== transition.gate) {
      throw new StagingMigrationReplayFailure(
        "phase-transition",
        `--phase-gate-attestation must exactly equal ${transition.gate}`,
      );
    }
  }
  if (!apply) {
    throw new StagingMigrationReplayFailure(
      "arguments",
      "--apply is required after completing the independent phase preflight",
    );
  }

  return {
    projectRef,
    expectedProjectRef,
    candidateSha,
    expectedCurrentVersion,
    throughVersion,
    blankPreflightAttestation,
    phaseGateAttestation,
    approvedCliVersion,
    apply: true,
  };
}

export function readMigrationInventory(cwd = process.cwd()) {
  const migrationDirectory = resolve(cwd, "supabase/migrations");
  const files = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const migrations = files.map((file) => {
    const match = MIGRATION_FILE_PATTERN.exec(file);
    if (!match) {
      throw new StagingMigrationReplayFailure(
        "migration-inventory",
        `unexpected file in supabase/migrations: ${file}`,
      );
    }
    return { file, version: match[1], path: `supabase/migrations/${file}` };
  });
  const versions = new Set(migrations.map(({ version }) => version));
  if (
    migrations.length !== EXPECTED_MIGRATION_COUNT
    || versions.size !== EXPECTED_MIGRATION_COUNT
    || migrations.at(-1)?.version !== EXPECTED_FINAL_MIGRATION_VERSION
  ) {
    throw new StagingMigrationReplayFailure(
      "migration-inventory",
      `expected exactly ${EXPECTED_MIGRATION_COUNT} uniquely versioned migrations ending at ${EXPECTED_FINAL_MIGRATION_VERSION}`,
    );
  }
  return migrations;
}

export function migrationPrefixThrough(migrations, throughVersion) {
  const throughIndex = migrations.findIndex(({ version }) => version === throughVersion);
  if (throughIndex < 0) {
    throw new StagingMigrationReplayFailure(
      "migration-inventory",
      `through-version ${throughVersion} is absent from the canonical inventory`,
    );
  }
  return migrations.slice(0, throughIndex + 1);
}

function normalizedLines(value) {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).sort();
}

export function validateCleanCandidate(config, migrations, runCommand, cwd = process.cwd()) {
  const root = runCommand("git", ["rev-parse", "--show-toplevel"], { capture: true, cwd }).output.trim();
  if (resolve(root) !== resolve(cwd)) {
    throw new StagingMigrationReplayFailure("git-candidate", "run the handoff from the repository root");
  }
  const status = runCommand(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { capture: true, cwd },
  ).output.trim();
  if (status) {
    throw new StagingMigrationReplayFailure("git-candidate", "the repository must be completely clean");
  }
  const head = runCommand("git", ["rev-parse", "HEAD"], { capture: true, cwd }).output.trim().toLowerCase();
  if (head !== config.candidateSha) {
    throw new StagingMigrationReplayFailure("git-candidate", "HEAD does not match --candidate-sha");
  }
  const tracked = normalizedLines(
    runCommand("git", ["ls-files", "--", "supabase/migrations"], { capture: true, cwd }).output,
  );
  const expected = migrations.map(({ path }) => path).sort();
  if (tracked.length !== expected.length || tracked.some((path, index) => path !== expected[index])) {
    throw new StagingMigrationReplayFailure(
      "git-candidate",
      `the tracked migration inventory does not exactly match the canonical ${EXPECTED_MIGRATION_COUNT}-file inventory`,
    );
  }

  // `git status` intentionally honors skip-worktree and assume-unchanged, so
  // it cannot by itself prove that the SQL on disk is the reviewed candidate.
  // Hash every working-tree file without clean/smudge filters and compare it
  // with the exact blob recorded at the attested candidate commit.
  for (const migration of migrations) {
    const workingBlob = runCommand(
      "git",
      ["hash-object", "--no-filters", "--", migration.path],
      { capture: true, cwd },
    ).output.trim().toLowerCase();
    const candidateBlob = runCommand(
      "git",
      ["rev-parse", `${config.candidateSha}:${migration.path}`],
      { capture: true, cwd },
    ).output.trim().toLowerCase();
    if (
      !GIT_BLOB_SHA_PATTERN.test(workingBlob)
      || !GIT_BLOB_SHA_PATTERN.test(candidateBlob)
      || workingBlob !== candidateBlob
    ) {
      throw new StagingMigrationReplayFailure(
        "git-candidate",
        `working migration bytes do not match the candidate commit for ${migration.path}`,
      );
    }
  }
}

export function createPhaseWorkdir(canonicalCwd, phaseMigrations) {
  const workdir = mkdtempSync(join(tmpdir(), TEMPORARY_WORKDIR_PREFIX));
  CREATED_PHASE_WORKDIRS.add(resolve(workdir));
  try {
    const migrationDirectory = join(workdir, "supabase/migrations");
    mkdirSync(migrationDirectory, { recursive: true });
    writeFileSync(
      join(workdir, "supabase/config.toml"),
      'project_id = "campus-companion-staging-migration-phase"\n',
      { encoding: "utf8", flag: "wx" },
    );
    for (const migration of phaseMigrations) {
      const source = resolve(canonicalCwd, migration.path);
      const destination = join(migrationDirectory, migration.file);
      copyFileSync(source, destination);
      if (!readFileSync(source).equals(readFileSync(destination))) {
        throw new StagingMigrationReplayFailure(
          "temporary-workdir",
          `byte verification failed for ${migration.file}`,
        );
      }
    }
    const copiedFiles = readdirSync(migrationDirectory).sort();
    const expectedFiles = phaseMigrations.map(({ file }) => file).sort();
    if (
      copiedFiles.length !== expectedFiles.length
      || copiedFiles.some((file, index) => file !== expectedFiles[index])
    ) {
      throw new StagingMigrationReplayFailure(
        "temporary-workdir",
        "temporary migration prefix does not exactly match the approved phase",
      );
    }
    return workdir;
  } catch (error) {
    removePhaseWorkdir(workdir);
    throw error;
  }
}

export function removePhaseWorkdir(workdir) {
  const resolvedWorkdir = resolve(workdir);
  if (
    dirname(resolvedWorkdir) !== resolve(tmpdir())
    || !basename(resolvedWorkdir).startsWith(TEMPORARY_WORKDIR_PREFIX)
    || !CREATED_PHASE_WORKDIRS.has(resolvedWorkdir)
  ) {
    throw new StagingMigrationReplayFailure(
      "temporary-workdir",
      "refusing to remove a path that is not the explicit migration mkdtemp",
    );
  }
  rmSync(resolvedWorkdir, { recursive: true, force: false });
  CREATED_PHASE_WORKDIRS.delete(resolvedWorkdir);
}

export function assertLinkedProjectRef(config, cwd) {
  let linkedProjectRef;
  try {
    linkedProjectRef = readFileSync(resolve(cwd, "supabase/.temp/project-ref"), "utf8").trim();
  } catch {
    throw new StagingMigrationReplayFailure(
      "target",
      "the official CLI did not create a readable linked-project marker",
    );
  }
  if (linkedProjectRef !== config.projectRef) {
    throw new StagingMigrationReplayFailure(
      "target",
      "the official CLI linked-project marker does not match the reviewed staging ref",
    );
  }
}

export function assertPhaseDryRunPlan(output, pendingMigrations) {
  const lines = output.split(/\r?\n/u);
  const dryRunHeadings = lines
    .map((line, index) => line.trim() === REVIEWED_DRY_RUN_HEADING ? index : -1)
    .filter((index) => index >= 0);
  const planHeadings = lines
    .map((line, index) => line.trim() === REVIEWED_MIGRATION_PLAN_HEADING ? index : -1)
    .filter((index) => index >= 0);
  if (
    dryRunHeadings.length !== 1
    || planHeadings.length !== 1
    || dryRunHeadings[0] >= planHeadings[0]
  ) {
    throw new StagingMigrationReplayFailure(
      "phase-dry-run",
      "output does not contain the one reviewed Supabase dry-run and migration-plan heading sequence",
    );
  }

  const plannedFiles = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/\b(?:warn|warning|skipped|skipping)\b/iu.test(lines[index])) {
      throw new StagingMigrationReplayFailure(
        "phase-dry-run",
        "the reviewed CLI plan must not contain a warning or skipped-migration marker",
      );
    }
    const migrationTokens = lines[index].match(/(?<!\d)\d{14}(?!\d)/gu) ?? [];
    if (migrationTokens.length === 0) continue;
    const row = REVIEWED_MIGRATION_FILENAME_ROW.exec(lines[index]);
    if (!row || index <= planHeadings[0] || migrationTokens.length !== 1) {
      throw new StagingMigrationReplayFailure(
        "phase-dry-run",
        "a migration token appeared outside one reviewed bullet filename row",
      );
    }
    plannedFiles.push(row[1]);
  }

  const expectedFiles = pendingMigrations.map(({ file }) => file);
  if (
    plannedFiles.length !== expectedFiles.length
    || plannedFiles.some((file, index) => file !== expectedFiles[index])
  ) {
    throw new StagingMigrationReplayFailure(
      "phase-dry-run",
      "the reviewed CLI plan rows do not exactly equal this transition's pending migration files",
    );
  }
}

export function assertSupabaseCliVersion(output, approvedCliVersion) {
  const versions = output.match(/\b\d+\.\d+\.\d+\b/gu) ?? [];
  if (versions.length !== 1 || versions[0] !== approvedCliVersion) {
    throw new StagingMigrationReplayFailure(
      "cli-version",
      "installed Supabase CLI version does not exactly match --approved-cli-version",
    );
  }
}

export function parseMigrationList(output) {
  const rows = [];
  for (const line of output.split(/\r?\n/u)) {
    const columns = line.split("|");
    if (columns.length < 2) continue;
    const local = /^\s*(\d{14})\s*$/u.exec(columns[0])?.[1] ?? null;
    const remote = /^\s*(\d{14})\s*$/u.exec(columns[1])?.[1] ?? null;
    if (local || remote) rows.push({ local, remote });
  }
  return rows;
}

function assertMigrationListState(output, localMigrations, remoteMigrations, check) {
  const rows = parseMigrationList(output);
  const expectedLocal = localMigrations.map(({ version }) => version);
  const expectedRemote = new Set(remoteMigrations.map(({ version }) => version));
  if (rows.length !== expectedLocal.length) {
    throw new StagingMigrationReplayFailure(check, "migration-list row count does not match the approved prefix");
  }
  const seenLocal = new Set();
  for (const row of rows) {
    if (!row.local || seenLocal.has(row.local) || !expectedLocal.includes(row.local)) {
      throw new StagingMigrationReplayFailure(check, "migration list contains a missing, duplicate, or unexpected local row");
    }
    seenLocal.add(row.local);
    const expectedRemoteVersion = expectedRemote.has(row.local) ? row.local : null;
    if (row.remote !== expectedRemoteVersion) {
      throw new StagingMigrationReplayFailure(
        check,
        "migration list contains an unexpected, unaligned, or remote-only ledger row",
      );
    }
  }
  if (seenLocal.size !== expectedLocal.length) {
    throw new StagingMigrationReplayFailure(check, "migration list omits an approved local version");
  }
}

export function assertInitialMigrationList(output, phaseMigrations, currentMigrations) {
  assertMigrationListState(output, phaseMigrations, currentMigrations, "phase-initial-ledger");
}

export function assertFinalMigrationList(output, phaseMigrations) {
  assertMigrationListState(output, phaseMigrations, phaseMigrations, "phase-final-ledger");
}

export function defaultCommandRunner(command, args, { capture = false, cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new StagingMigrationReplayFailure("command", `${command} could not be started`);
  }
  if (result.status !== 0) {
    throw new StagingMigrationReplayFailure("command", `${command} exited with status ${result.status}`);
  }
  return {
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
  };
}

export function runStagingMigrationReplay(
  config,
  {
    cwd = process.cwd(),
    runCommand = defaultCommandRunner,
    log = (message) => console.log(message),
    inventory = readMigrationInventory(cwd),
    makeWorkdir = createPhaseWorkdir,
    removeWorkdir = removePhaseWorkdir,
    verifyLinkedProject = assertLinkedProjectRef,
  } = {},
) {
  assertRuntimeConfiguration(config);
  validateCleanCandidate(config, inventory, runCommand, cwd);
  const cliVersion = runCommand("supabase", ["--version"], { capture: true, cwd }).output;
  assertSupabaseCliVersion(cliVersion, config.approvedCliVersion);

  const phaseMigrations = migrationPrefixThrough(inventory, config.throughVersion);
  const currentMigrations = config.expectedCurrentVersion === null
    ? []
    : migrationPrefixThrough(inventory, config.expectedCurrentVersion);
  const pendingMigrations = phaseMigrations.slice(currentMigrations.length);
  const phaseWorkdir = makeWorkdir(cwd, phaseMigrations);
  let pushAttempted = false;
  let operationError = null;

  try {
    log(
      `Preparing migration phase ${config.expectedCurrentVersion ?? "none"} -> ${config.throughVersion} for ${config.projectRef}.`,
    );
    runCommand("supabase", ["link", "--project-ref", config.projectRef], { cwd: phaseWorkdir });
    verifyLinkedProject(config, phaseWorkdir);
    validateCleanCandidate(config, inventory, runCommand, cwd);

    const initialList = runCommand(
      "supabase",
      ["migration", "list", "--linked"],
      { capture: true, cwd: phaseWorkdir },
    ).output;
    assertInitialMigrationList(initialList, phaseMigrations, currentMigrations);

    const dryRun = runCommand(
      "supabase",
      ["db", "push", "--linked", "--include-all", "--dry-run", "--yes"],
      { capture: true, cwd: phaseWorkdir },
    ).output;
    assertPhaseDryRunPlan(dryRun, pendingMigrations);
    validateCleanCandidate(config, inventory, runCommand, cwd);
    verifyLinkedProject(config, phaseWorkdir);

    pushAttempted = true;
    runCommand(
      "supabase",
      ["db", "push", "--linked", "--include-all", "--yes"],
      { cwd: phaseWorkdir },
    );

    const finalList = runCommand(
      "supabase",
      ["migration", "list", "--linked"],
      { capture: true, cwd: phaseWorkdir },
    ).output;
    assertFinalMigrationList(finalList, phaseMigrations);
    validateCleanCandidate(config, inventory, runCommand, cwd);
  } catch (error) {
    if (pushAttempted) {
      operationError = new StagingMigrationReplayFailure(
        "migration-push",
        "push or final verification failed; quarantine and discard this target, then use a newly blank project—never retry or repair its ledger",
      );
    } else {
      operationError = error;
    }
  }

  try {
    removeWorkdir(phaseWorkdir);
  } catch {
    if (operationError instanceof Error) {
      operationError.message = `${operationError.message}; secondary cleanup failure: the explicit temporary workdir requires manual removal`;
    } else {
      operationError = new StagingMigrationReplayFailure(
        "temporary-workdir",
        "the explicit temporary workdir could not be removed and requires manual removal",
      );
    }
  }

  if (operationError) throw operationError;

  log(
    `Verified migration phase through ${config.throughVersion}; stop for the documented operator gate before another phase.`,
  );
  log("No Edge Function was deployed by this migration runner.");
}

function usage() {
  return [
    "Usage:",
    "  npm run migrate:staging:phase -- \\",
    "    --project-ref <new-private-staging-ref> \\",
    "    --expected-project-ref <same-project-ref> \\",
    "    --candidate-sha <full-40-character-sha> \\",
    "    --expected-current-version <none-or-14-digit-version> \\",
    "    --through-version <allowed-14-digit-version> \\",
    "    --approved-cli-version <reviewed-x.y.z> \\",
    "    [--blank-preflight-attestation <project-ref>:zero-auth-users:zero-public-tables:zero-ledger-rows] \\",
    "    [--phase-gate-attestation <exact-transition-gate>] \\",
    "    --apply",
  ].join("\n");
}

async function main() {
  try {
    const config = parseReplayArguments(process.argv.slice(2));
    runStagingMigrationReplay(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    console.error(`Staging migration phase stopped: ${message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
