import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const EXPECTED_MIGRATION_COUNT = 64;
export const EXPECTED_FINAL_MIGRATION_VERSION = "20260830231658";
export const CONTROL_SCHEMA = "cc_staging_migration";
export const PROTECTED_LOVABLE_PROJECT_IDS = Object.freeze([
  "a08a7f00-4b76-4d5b-ac89-2c15e604054a", // production Campus Coach Pro
  "14ee9834-144c-4923-9963-b5389d0cc4ca", // previous published Family Beta
  "22053d35-bc57-4b25-a9a5-3a7ed8e158b2", // abandoned lzw staging authority
  "33bcdaaa-6765-4b62-a375-a58b661726ea", // quarantined nondeterministic mvi replay
  "0b0043fb-1222-49bd-a350-a068bcb3d844", // unused Lovable shell
  "45c02d1f-91a2-4b8d-8fcd-eea6402e45ad", // quarantined after failed replay
]);
export const POST_PHASE_GATES = Object.freeze([
  {
    previousOrdinal: 51,
    previousVersion: "20260827125500",
    targetOrdinal: 52,
    targetVersion: "20260827126000",
    attestation: "writes-paused-edge-deployed-tested-drained",
  },
  {
    previousOrdinal: 52,
    previousVersion: "20260827126000",
    targetOrdinal: 53,
    targetVersion: "20260827126500",
    attestation: "writes-paused-agreement-migration-verified",
  },
  {
    previousOrdinal: 53,
    previousVersion: "20260827126500",
    targetOrdinal: 54,
    targetVersion: "20260827126750",
    attestation: "writes-paused-raw-input-guard-verified",
  },
  {
    previousOrdinal: 54,
    previousVersion: "20260827126750",
    targetOrdinal: 55,
    targetVersion: "20260827127500",
    attestation: "writes-paused-agreement-ui-canaries-passed",
  },
  {
    previousOrdinal: 55,
    previousVersion: "20260827127500",
    targetOrdinal: 56,
    targetVersion: "20260827130000",
    attestation: "writes-paused-mirror-retirement-verified",
  },
  {
    previousOrdinal: 56,
    previousVersion: "20260827130000",
    targetOrdinal: 57,
    targetVersion: "20260827132000",
    attestation: "writes-paused-capture-lockdown-verified",
  },
  {
    previousOrdinal: 57,
    previousVersion: "20260827132000",
    targetOrdinal: 58,
    targetVersion: "20260827133000",
    attestation: "writes-paused-storage-integrity-verified",
  },
  {
    previousOrdinal: 58,
    previousVersion: "20260827133000",
    targetOrdinal: 59,
    targetVersion: "20260827134000",
    attestation: "writes-paused-learning-evidence-guard-verified",
  },
  {
    previousOrdinal: 59,
    previousVersion: "20260827134000",
    targetOrdinal: 60,
    targetVersion: "20260827135000",
    attestation: "writes-paused-class-owner-scope-verified",
  },
  {
    previousOrdinal: 60,
    previousVersion: "20260827135000",
    targetOrdinal: 61,
    targetVersion: "20260827140000",
    attestation: "writes-paused-launch-schema-regression-verified",
  },
  {
    previousOrdinal: 61,
    previousVersion: "20260827140000",
    targetOrdinal: 62,
    targetVersion: "20260828100000",
    attestation: "writes-paused-onboarding-owner-guard-verified",
  },
  {
    previousOrdinal: 62,
    previousVersion: "20260828100000",
    targetOrdinal: 63,
    targetVersion: "20260828110000",
    attestation: "writes-paused-evidence-contract-edge-deployed-verified",
  },
  {
    previousOrdinal: 63,
    previousVersion: "20260828110000",
    targetOrdinal: 64,
    targetVersion: "20260830231658",
    attestation: "writes-paused-practice-source-confirmation-verified",
  },
].map((gate) => Object.freeze(gate)));
export const EXPECTED_OUTER_TRANSACTION_FILES = Object.freeze([
  "20260817100000_middle_school_learner_type.sql",
  "20260817110000_backfill_onboarding_completion.sql",
  "20260817123000_capture_attempt_idempotency.sql",
  "20260819190031_c4405e67-dc73-401d-9fb7-140a7bebd373.sql",
  "20260819190050_f2bd7a37-aab1-4168-9d41-7b400136b9a9.sql",
  "20260819190112_49d91cbe-c364-4d2d-8f1e-46de50121a18.sql",
  "20260827125500_study_write_maintenance_guard.sql",
  "20260827126500_family_beta_raw_input_guard.sql",
  "20260827126750_capture_request_idempotency.sql",
  "20260827132000_capture_storage_integrity.sql",
  "20260827133000_browser_learning_evidence_write_guard.sql",
  "20260827134000_class_client_identity_owner_scope.sql",
  "20260827135000_launch_schema_regression_guard.sql",
  "20260827140000_onboarding_agreement_owner_guard.sql",
  "20260828100000_learning_evidence_ladder.sql",
  "20260828110000_full_scope_readiness.sql",
]);

const MIGRATION_FILE_PATTERN = /^(\d{14})_[a-z0-9_-]+\.sql$/u;
const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRANSACTION_WORDS = new Set([
  "abort",
  "begin",
  "commit",
  "end",
  "prepare",
  "release",
  "rollback",
  "savepoint",
  "start",
]);

export class LovableStagingPayloadFailure extends Error {
  constructor(check, reason) {
    super(`${check}: ${reason}`);
    this.name = "LovableStagingPayloadFailure";
    this.check = check;
  }
}

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function updateLineState(fragment, current) {
  const lastNewline = fragment.lastIndexOf("\n");
  if (lastNewline < 0) return current && /^\s*$/u.test(fragment);
  return /^\s*$/u.test(fragment.slice(lastNewline + 1));
}

/**
 * Scan only SQL outside comments and quoted regions. Dollar-quoted PL/pgSQL
 * bodies are opaque, so their BEGIN/END tokens cannot be confused with
 * transaction control. PostgreSQL block comments may nest.
 */
export function scanTopLevelSql(sql) {
  const tokens = [];
  let index = 0;
  let lineOnlyWhitespace = true;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (/\s/u.test(character)) {
      if (character === "\n" || character === "\r") lineOnlyWhitespace = true;
      index += 1;
      continue;
    }

    if (character === "-" && next === "-") {
      const newline = sql.indexOf("\n", index + 2);
      index = newline < 0 ? sql.length : newline;
      continue;
    }

    if (character === "/" && next === "*") {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth !== 0) {
        throw new LovableStagingPayloadFailure("sql-lexer", "unterminated block comment");
      }
      lineOnlyWhitespace = updateLineState(sql.slice(start, index), lineOnlyWhitespace);
      continue;
    }

    if (character === "\\" && lineOnlyWhitespace) {
      throw new LovableStagingPayloadFailure(
        "sql-meta-command",
        "psql backslash commands are forbidden",
      );
    }

    if (character === "'") {
      const start = index;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === "\\") {
          index += 2;
          continue;
        }
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        throw new LovableStagingPayloadFailure("sql-lexer", "unterminated string literal");
      }
      lineOnlyWhitespace = updateLineState(sql.slice(start, index), false);
      continue;
    }

    if (character === '"') {
      const start = index;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          index += 2;
          continue;
        }
        if (sql[index] === '"') {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        throw new LovableStagingPayloadFailure("sql-lexer", "unterminated quoted identifier");
      }
      lineOnlyWhitespace = updateLineState(sql.slice(start, index), false);
      continue;
    }

    if (character === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(sql.slice(index))?.[0];
      if (tag) {
        const start = index;
        const end = sql.indexOf(tag, index + tag.length);
        if (end < 0) {
          throw new LovableStagingPayloadFailure("sql-lexer", "unterminated dollar quote");
        }
        index = end + tag.length;
        lineOnlyWhitespace = updateLineState(sql.slice(start, index), false);
        continue;
      }
    }

    lineOnlyWhitespace = false;
    if (/[A-Za-z_]/u.test(character)) {
      const start = index;
      index += 1;
      while (index < sql.length && /[A-Za-z0-9_$]/u.test(sql[index])) index += 1;
      tokens.push({ kind: "word", value: sql.slice(start, index).toLowerCase(), start, end: index });
      continue;
    }
    if (character === ";") {
      tokens.push({ kind: "semicolon", value: ";", start: index, end: index + 1 });
    }
    index += 1;
  }

  const statements = [];
  let words = [];
  let start = null;
  for (const token of tokens) {
    if (token.kind === "word") {
      if (start === null) start = token.start;
      words.push(token.value);
      continue;
    }
    if (words.length > 0) {
      statements.push({ words, start, end: token.end, terminated: true });
      words = [];
      start = null;
    }
  }
  if (words.length > 0) statements.push({ words, start, end: sql.length, terminated: false });
  return statements;
}

function findTopLevelDollarQuotes(sql) {
  const quotes = [];
  let index = 0;
  while (index < sql.length) {
    if (sql[index] === "-" && sql[index + 1] === "-") {
      const newline = sql.indexOf("\n", index + 2);
      index = newline < 0 ? sql.length : newline;
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      continue;
    }
    if (sql[index] === "'" || sql[index] === '"') {
      const delimiter = sql[index];
      index += 1;
      while (index < sql.length) {
        if (delimiter === "'" && sql[index] === "\\") {
          index += 2;
        } else if (sql[index] === delimiter && sql[index + 1] === delimiter) {
          index += 2;
        } else if (sql[index] === delimiter) {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }
    if (sql[index] === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(sql.slice(index))?.[0];
      if (tag) {
        const bodyStart = index + tag.length;
        const close = sql.indexOf(tag, bodyStart);
        if (close < 0) {
          throw new LovableStagingPayloadFailure("sql-lexer", "unterminated dollar quote");
        }
        quotes.push({ start: index, end: close + tag.length, body: sql.slice(bodyStart, close) });
        index = close + tag.length;
        continue;
      }
    }
    index += 1;
  }
  return quotes;
}

function scanPlpgsqlBodyTokens(body) {
  const tokens = [];
  let index = 0;
  while (index < body.length) {
    if (/\s/u.test(body[index])) {
      index += 1;
      continue;
    }
    if (body[index] === "-" && body[index + 1] === "-") {
      const newline = body.indexOf("\n", index + 2);
      index = newline < 0 ? body.length : newline;
      continue;
    }
    if (body[index] === "/" && body[index + 1] === "*") {
      let depth = 1;
      index += 2;
      while (index < body.length && depth > 0) {
        if (body[index] === "/" && body[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (body[index] === "*" && body[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      continue;
    }
    if (body[index] === "'" || body[index] === '"') {
      const delimiter = body[index];
      index += 1;
      while (index < body.length) {
        if (delimiter === "'" && body[index] === "\\") {
          index += 2;
        } else if (body[index] === delimiter && body[index + 1] === delimiter) {
          index += 2;
        } else if (body[index] === delimiter) {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      tokens.push({ kind: "opaque", value: null });
      continue;
    }
    if (body[index] === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(body.slice(index))?.[0];
      if (tag) {
        const close = body.indexOf(tag, index + tag.length);
        if (close < 0) {
          throw new LovableStagingPayloadFailure("sql-lexer", "unterminated nested dollar quote");
        }
        index = close + tag.length;
        tokens.push({ kind: "opaque", value: null });
        continue;
      }
    }
    if (/[A-Za-z_]/u.test(body[index])) {
      const start = index;
      index += 1;
      while (index < body.length && /[A-Za-z0-9_$]/u.test(body[index])) index += 1;
      tokens.push({ kind: "word", value: body.slice(start, index).toLowerCase() });
      continue;
    }
    tokens.push({ kind: "symbol", value: body[index] });
    index += 1;
  }
  return tokens;
}

function assertNoTopLevelCaseInPlpgsqlConditions(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = tokens[index - 1];
    const startsIfStatement = token.kind === "word"
      && token.value === "if"
      && previous?.value !== "end"
      && (
        index === 0
        || (previous.kind === "symbol" && previous.value === ";")
        || (previous.kind === "word" && ["begin", "then", "else", "loop"].includes(previous.value))
        || (previous.kind === "symbol" && previous.value === ">" && tokens[index - 2]?.value === ">")
      );
    const startsElsifCondition = token.kind === "word" && ["elsif", "elseif"].includes(token.value);
    if (
      !startsIfStatement
      && !startsElsifCondition
    ) {
      continue;
    }

    let parenthesisDepth = 0;
    let caseDepth = 0;
    for (let conditionIndex = index + 1; conditionIndex < tokens.length; conditionIndex += 1) {
      const conditionToken = tokens[conditionIndex];
      if (conditionToken.kind === "symbol") {
        if (conditionToken.value === "(") parenthesisDepth += 1;
        if (conditionToken.value === ")") parenthesisDepth = Math.max(0, parenthesisDepth - 1);
        if (conditionToken.value === ";" && parenthesisDepth === 0 && caseDepth === 0) break;
        continue;
      }
      if (conditionToken.kind !== "word") continue;

      if (conditionToken.value === "case") {
        if (parenthesisDepth === 0) {
          throw new LovableStagingPayloadFailure(
            "postgres-parse-ambiguity",
            "CASE expressions at the top level of a PL/pgSQL IF or ELSIF condition must be parenthesized",
          );
        }
        caseDepth += 1;
        continue;
      }
      if (conditionToken.value === "end" && caseDepth > 0) {
        caseDepth -= 1;
        continue;
      }
      if (conditionToken.value === "then" && parenthesisDepth === 0 && caseDepth === 0) break;
    }
  }
}

function assertParenthesizedPlpgsqlCases(sql, statements) {
  const dollarQuotes = findTopLevelDollarQuotes(sql);
  for (const statement of statements) {
    const isDoBlock = statement.words[0] === "do"
      && (!statement.words.includes("language") || includesSequence(statement.words, ["language", "plpgsql"]));
    const isPlpgsqlRoutine = ["function", "procedure"].some((kind) => statement.words.includes(kind))
      && includesSequence(statement.words, ["language", "plpgsql"]);
    if (!isDoBlock && !isPlpgsqlRoutine) continue;

    const bodies = dollarQuotes.filter(({ start, end }) => start >= statement.start && end <= statement.end);
    const body = bodies.at(-1)?.body;
    if (body === undefined) continue;
    const tokens = scanPlpgsqlBodyTokens(body);
    assertNoTopLevelCaseInPlpgsqlConditions(tokens);
  }
}

function includesSequence(words, sequence) {
  for (let index = 0; index <= words.length - sequence.length; index += 1) {
    if (sequence.every((word, offset) => words[index + offset] === word)) return true;
  }
  return false;
}

function assertTransactionalStatements(statements) {
  for (const statement of statements) {
    const words = statement.words;
    if (
      words[0] === "vacuum"
      || includesSequence(words, ["create", "database"])
      || includesSequence(words, ["drop", "database"])
      || includesSequence(words, ["create", "index", "concurrently"])
      || includesSequence(words, ["create", "unique", "index", "concurrently"])
      || includesSequence(words, ["drop", "index", "concurrently"])
      || (words[0] === "reindex" && words.includes("concurrently"))
      || includesSequence(words, ["refresh", "materialized", "view", "concurrently"])
      || (includesSequence(words, ["alter", "type"]) && includesSequence(words, ["add", "value"]))
    ) {
      throw new LovableStagingPayloadFailure(
        "transaction-safety",
        "migration contains a command that is unsafe in the required atomic wrapper",
      );
    }
  }
}

export function analyzeMigrationSql(sql) {
  const statements = scanTopLevelSql(sql);
  if (statements.length === 0 || statements.some(({ terminated }) => !terminated)) {
    throw new LovableStagingPayloadFailure(
      "sql-structure",
      "migration must contain only semicolon-terminated top-level statements",
    );
  }
  assertParenthesizedPlpgsqlCases(sql, statements);
  assertTransactionalStatements(statements);

  const transactionIndexes = statements
    .map((statement, index) => TRANSACTION_WORDS.has(statement.words[0]) ? index : -1)
    .filter((index) => index >= 0);
  const hasOuterTransaction = statements[0].words.length === 1
    && statements[0].words[0] === "begin"
    && statements.at(-1).words.length === 1
    && statements.at(-1).words[0] === "commit";

  if (hasOuterTransaction) {
    if (
      transactionIndexes.length !== 2
      || transactionIndexes[0] !== 0
      || transactionIndexes[1] !== statements.length - 1
    ) {
      throw new LovableStagingPayloadFailure(
        "transaction-structure",
        "outer-transaction migration contains nested or nonfinal transaction control",
      );
    }
  } else if (transactionIndexes.length > 0) {
    throw new LovableStagingPayloadFailure(
      "transaction-structure",
      "transaction control is allowed only as one outer BEGIN/final COMMIT pair",
    );
  }

  return {
    hasOuterTransaction,
    statements,
    beginInsertion: hasOuterTransaction ? statements[0].end : null,
    commitInsertion: hasOuterTransaction ? statements.at(-1).start : null,
  };
}

export function readLovableMigrationManifest(cwd = process.cwd()) {
  const directory = resolve(cwd, "supabase/migrations");
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (files.length !== EXPECTED_MIGRATION_COUNT) {
    throw new LovableStagingPayloadFailure(
      "migration-inventory",
      `expected exactly ${EXPECTED_MIGRATION_COUNT} migration files`,
    );
  }

  const entries = files.map((filename, index) => {
    const match = MIGRATION_FILE_PATTERN.exec(filename);
    if (!match) {
      throw new LovableStagingPayloadFailure(
        "migration-inventory",
        `unexpected migration filename ${filename}`,
      );
    }
    const bytes = readFileSync(resolve(directory, filename));
    const sql = bytes.toString("utf8");
    const analysis = analyzeMigrationSql(sql);
    return Object.freeze({
      ordinal: index + 1,
      version: match[1],
      filename,
      path: `supabase/migrations/${filename}`,
      fileSha256: digest("sha256", bytes),
      gitBlobSha1: gitBlobSha(bytes),
      sql,
      hasOuterTransaction: analysis.hasOuterTransaction,
    });
  });

  const versions = new Set(entries.map(({ version }) => version));
  const outerFiles = entries.filter(({ hasOuterTransaction }) => hasOuterTransaction)
    .map(({ filename }) => filename);
  if (
    versions.size !== EXPECTED_MIGRATION_COUNT
    || entries.at(-1)?.version !== EXPECTED_FINAL_MIGRATION_VERSION
    || outerFiles.length !== EXPECTED_OUTER_TRANSACTION_FILES.length
    || outerFiles.some((filename, index) => filename !== EXPECTED_OUTER_TRANSACTION_FILES[index])
  ) {
    throw new LovableStagingPayloadFailure(
      "migration-inventory",
      "migration versions or reviewed outer-transaction topology changed",
    );
  }

  const inventoryBytes = Buffer.from(entries.map((entry) => [
    entry.ordinal,
    entry.version,
    entry.filename,
    entry.fileSha256,
    entry.gitBlobSha1,
  ].join("\0")).join("\n"), "utf8");
  return Object.freeze({
    entries: Object.freeze(entries),
    inventorySha256: digest("sha256", inventoryBytes),
  });
}

function defaultGitRunner(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    stdio: "pipe",
  });
  if (result.error || result.status !== 0) {
    throw new LovableStagingPayloadFailure(
      "git-candidate",
      `git ${args.join(" ")} did not complete successfully`,
    );
  }
  return String(result.stdout ?? "").trim();
}

export function assertGitCandidateManifest(
  candidateSha,
  manifest,
  cwd = process.cwd(),
  runGit = defaultGitRunner,
) {
  const normalizedCandidateSha = String(candidateSha ?? "").toLowerCase();
  if (!SHA1_PATTERN.test(normalizedCandidateSha)) {
    throw new LovableStagingPayloadFailure("git-candidate", "candidate SHA is invalid");
  }
  const root = runGit(["rev-parse", "--show-toplevel"], cwd);
  if (resolve(root) !== resolve(cwd)) {
    throw new LovableStagingPayloadFailure(
      "git-candidate",
      "payloads must be generated from the repository root",
    );
  }
  if (runGit(["status", "--porcelain=v1", "--untracked-files=all"], cwd) !== "") {
    throw new LovableStagingPayloadFailure(
      "git-candidate",
      "repository must be completely clean before emitting deployment SQL",
    );
  }
  if (runGit(["rev-parse", "HEAD"], cwd).toLowerCase() !== normalizedCandidateSha) {
    throw new LovableStagingPayloadFailure(
      "git-candidate",
      "HEAD does not match the attested candidate SHA",
    );
  }

  const treeRows = runGit(
    ["ls-tree", "-r", normalizedCandidateSha, "--", "supabase/migrations"],
    cwd,
  ).split(/\r?\n/u).filter(Boolean);
  const treeBlobs = new Map();
  for (const row of treeRows) {
    const match = /^\d+\s+blob\s+([0-9a-f]{40})\t(.+)$/u.exec(row);
    if (!match || treeBlobs.has(match[2])) {
      throw new LovableStagingPayloadFailure(
        "git-candidate",
        "candidate migration tree contains an unexpected or duplicate row",
      );
    }
    treeBlobs.set(match[2], match[1]);
  }
  if (
    treeBlobs.size !== manifest.entries.length
    || manifest.entries.some((entry) => treeBlobs.get(entry.path) !== entry.gitBlobSha1)
  ) {
    throw new LovableStagingPayloadFailure(
      "git-candidate",
      "working migration bytes do not exactly match the candidate tree",
    );
  }
}

function validateIdentity({ projectId, candidateSha }) {
  const normalizedProjectId = String(projectId ?? "").toLowerCase();
  const normalizedCandidateSha = String(candidateSha ?? "").toLowerCase();
  if (!UUID_PATTERN.test(normalizedProjectId)) {
    throw new LovableStagingPayloadFailure("arguments", "projectId must be one canonical UUID");
  }
  if (PROTECTED_LOVABLE_PROJECT_IDS.includes(normalizedProjectId)) {
    throw new LovableStagingPayloadFailure(
      "protected-project",
      "payload generation is forbidden for this Lovable project",
    );
  }
  if (!SHA1_PATTERN.test(normalizedCandidateSha)) {
    throw new LovableStagingPayloadFailure("arguments", "candidateSha must be one full lowercase SHA");
  }
  return { projectId: normalizedProjectId, candidateSha: normalizedCandidateSha };
}

export function selectMigration(manifest, ordinal, version) {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > EXPECTED_MIGRATION_COUNT) {
    throw new LovableStagingPayloadFailure("selection", "ordinal must select exactly one migration");
  }
  if (!/^\d{14}$/u.test(String(version))) {
    throw new LovableStagingPayloadFailure("selection", "version must contain exactly 14 digits");
  }
  const entry = manifest.entries[ordinal - 1];
  if (!entry || entry.ordinal !== ordinal || entry.version !== version) {
    throw new LovableStagingPayloadFailure(
      "selection",
      "ordinal and version do not identify the same canonical migration",
    );
  }
  return entry;
}

function validateAttemptNonce(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new LovableStagingPayloadFailure("arguments", "attemptNonce must be one canonical UUID");
  }
  return normalized;
}

function transactionPrelude() {
  return [
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '120s';",
    "SELECT pg_advisory_xact_lock(hashtextextended('campuscoach:lovable-staging-migration', 0));",
  ].join("\n");
}

function gateForMigration(entry) {
  return POST_PHASE_GATES.find(({ targetOrdinal, targetVersion }) => (
    targetOrdinal === entry.ordinal && targetVersion === entry.version
  )) ?? null;
}

function requiredGateSql(identity, manifest, entry) {
  const gate = gateForMigration(entry);
  if (!gate) return "";
  return `
     OR NOT EXISTS (
       SELECT 1
       FROM ${CONTROL_SCHEMA}.gate_attestations gate
       WHERE gate.target_ordinal = ${gate.targetOrdinal}
         AND gate.target_version = ${sqlLiteral(gate.targetVersion)}
         AND gate.previous_ordinal = ${gate.previousOrdinal}
         AND gate.previous_version = ${sqlLiteral(gate.previousVersion)}
         AND gate.attestation = ${sqlLiteral(gate.attestation)}
         AND gate.lovable_project_id = ${sqlLiteral(identity.projectId)}::uuid
         AND gate.candidate_sha = ${sqlLiteral(identity.candidateSha)}
         AND gate.inventory_sha256 = ${sqlLiteral(manifest.inventorySha256)}
     )`;
}

function migrationGuardSql(identity, manifest, entry, attemptNonce) {
  const gateRequirement = requiredGateSql(identity, manifest, entry);
  return `DO $cc_staging_guard$
DECLARE
  v_state ${CONTROL_SCHEMA}.state%ROWTYPE;
  v_manifest ${CONTROL_SCHEMA}.manifest%ROWTYPE;
  v_applied_count integer;
BEGIN
  SELECT * INTO STRICT v_state
  FROM ${CONTROL_SCHEMA}.state
  WHERE singleton
  FOR UPDATE;

  SELECT * INTO STRICT v_manifest
  FROM ${CONTROL_SCHEMA}.manifest
  WHERE ordinal = ${entry.ordinal};

  SELECT count(*) INTO v_applied_count
  FROM ${CONTROL_SCHEMA}.applied;

  IF v_state.lovable_project_id <> ${sqlLiteral(identity.projectId)}::uuid
     OR v_state.candidate_sha <> ${sqlLiteral(identity.candidateSha)}
     OR v_state.inventory_sha256 <> ${sqlLiteral(manifest.inventorySha256)}
     OR v_state.status <> 'executing'
     OR v_state.current_ordinal <> ${entry.ordinal - 1}
     OR v_state.pending_version IS DISTINCT FROM ${sqlLiteral(entry.version)}
     OR v_state.attempt_nonce IS DISTINCT FROM ${sqlLiteral(attemptNonce)}::uuid
     OR v_manifest.version <> ${sqlLiteral(entry.version)}
     OR v_manifest.filename <> ${sqlLiteral(entry.filename)}
     OR v_manifest.file_sha256 <> ${sqlLiteral(entry.fileSha256)}
     OR v_manifest.git_blob_sha1 <> ${sqlLiteral(entry.gitBlobSha1)}
     OR v_applied_count <> ${entry.ordinal - 1}${gateRequirement}
  THEN
    RAISE EXCEPTION 'lovable staging migration guard mismatch';
  END IF;
END;
$cc_staging_guard$;`;
}

function migrationReceiptSql(identity, entry, attemptNonce) {
  const nextStatus = entry.ordinal === EXPECTED_MIGRATION_COUNT ? "complete" : "ready";
  return `DO $cc_staging_receipt$
DECLARE
  v_state ${CONTROL_SCHEMA}.state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_state
  FROM ${CONTROL_SCHEMA}.state
  WHERE singleton
  FOR UPDATE;

  IF v_state.status <> 'executing'
     OR v_state.current_ordinal <> ${entry.ordinal - 1}
     OR v_state.pending_version IS DISTINCT FROM ${sqlLiteral(entry.version)}
     OR v_state.attempt_nonce IS DISTINCT FROM ${sqlLiteral(attemptNonce)}::uuid
  THEN
    RAISE EXCEPTION 'lovable staging migration receipt mismatch';
  END IF;

  INSERT INTO ${CONTROL_SCHEMA}.applied (
    ordinal,
    version,
    file_sha256,
    git_blob_sha1,
    candidate_sha,
    attempt_nonce
  ) VALUES (
    ${entry.ordinal},
    ${sqlLiteral(entry.version)},
    ${sqlLiteral(entry.fileSha256)},
    ${sqlLiteral(entry.gitBlobSha1)},
    ${sqlLiteral(identity.candidateSha)},
    ${sqlLiteral(attemptNonce)}::uuid
  );

  UPDATE ${CONTROL_SCHEMA}.state
  SET current_ordinal = ${entry.ordinal},
      status = ${sqlLiteral(nextStatus)},
      pending_version = NULL,
      attempt_nonce = NULL,
      updated_at = clock_timestamp()
  WHERE singleton;
END;
$cc_staging_receipt$;`;
}

export function buildBootstrapPayload(config, manifest = readLovableMigrationManifest()) {
  const identity = validateIdentity(config);
  if (!SHA256_PATTERN.test(manifest.inventorySha256)) {
    throw new LovableStagingPayloadFailure("manifest", "inventory hash is invalid");
  }
  const values = manifest.entries.map((entry) => (
    `  (${entry.ordinal}, ${sqlLiteral(entry.version)}, ${sqlLiteral(entry.filename)}, `
      + `${sqlLiteral(entry.fileSha256)}, ${sqlLiteral(entry.gitBlobSha1)})`
  )).join(",\n");

  return `BEGIN;
${transactionPrelude()}

DO $cc_staging_blank$
DECLARE
  v_has_canonical_rows boolean := false;
BEGIN
  IF to_regnamespace('${CONTROL_SCHEMA}') IS NOT NULL THEN
    RAISE EXCEPTION '${CONTROL_SCHEMA} already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'staging target contains auth users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION 'staging target contains public tables';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'staging target contains public functions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_views WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION 'staging target contains public views';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_matviews WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION 'staging target contains public materialized views';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_sequences WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION 'staging target contains public sequences';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS t
    JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('c', 'd', 'e', 'm', 'r')
  ) THEN
    RAISE EXCEPTION 'staging target contains public types';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations)'
      INTO v_has_canonical_rows;
    IF v_has_canonical_rows THEN
      RAISE EXCEPTION 'canonical migration ledger is not empty';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'staging target contains storage objects';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  ) THEN
    RAISE EXCEPTION 'staging target contains storage object policies';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE (id, name) NOT IN (
      ('capture-sources', 'capture-sources'),
      ('syllabus-sources', 'syllabus-sources')
    )
  ) OR (SELECT count(*) FROM storage.buckets) > 2 THEN
    RAISE EXCEPTION 'staging target contains unexpected storage buckets';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job) THEN
    RAISE EXCEPTION 'staging target contains cron jobs';
  END IF;
  IF EXISTS (SELECT 1 FROM vault.secrets) THEN
    RAISE EXCEPTION 'staging target contains vault secrets';
  END IF;
END;
$cc_staging_blank$;

CREATE SCHEMA ${CONTROL_SCHEMA};
REVOKE ALL ON SCHEMA ${CONTROL_SCHEMA}
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE ${CONTROL_SCHEMA}.manifest (
  ordinal smallint PRIMARY KEY CHECK (ordinal BETWEEN 1 AND ${EXPECTED_MIGRATION_COUNT}),
  version text NOT NULL UNIQUE CHECK (version ~ '^[0-9]{14}$'),
  filename text NOT NULL UNIQUE,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  git_blob_sha1 text NOT NULL CHECK (git_blob_sha1 ~ '^[0-9a-f]{40}$'),
  UNIQUE (version, file_sha256),
  UNIQUE (ordinal, version)
);

CREATE TABLE ${CONTROL_SCHEMA}.state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  lovable_project_id uuid NOT NULL,
  candidate_sha text NOT NULL CHECK (candidate_sha ~ '^[0-9a-f]{40}$'),
  inventory_sha256 text NOT NULL CHECK (inventory_sha256 ~ '^[0-9a-f]{64}$'),
  current_ordinal smallint NOT NULL DEFAULT 0
    CHECK (current_ordinal BETWEEN 0 AND ${EXPECTED_MIGRATION_COUNT}),
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'executing', 'quarantined', 'complete')),
  pending_version text CHECK (pending_version IS NULL OR pending_version ~ '^[0-9]{14}$'),
  attempt_nonce uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (status = 'executing' AND pending_version IS NOT NULL AND attempt_nonce IS NOT NULL)
    OR (status <> 'executing' AND pending_version IS NULL AND attempt_nonce IS NULL)
  )
);

CREATE TABLE ${CONTROL_SCHEMA}.applied (
  ordinal smallint PRIMARY KEY
    REFERENCES ${CONTROL_SCHEMA}.manifest(ordinal),
  version text NOT NULL UNIQUE,
  file_sha256 text NOT NULL,
  git_blob_sha1 text NOT NULL CHECK (git_blob_sha1 ~ '^[0-9a-f]{40}$'),
  candidate_sha text NOT NULL CHECK (candidate_sha ~ '^[0-9a-f]{40}$'),
  attempt_nonce uuid NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (version, file_sha256)
    REFERENCES ${CONTROL_SCHEMA}.manifest(version, file_sha256)
);

CREATE TABLE ${CONTROL_SCHEMA}.gate_attestations (
  target_ordinal smallint PRIMARY KEY,
  target_version text NOT NULL UNIQUE,
  previous_ordinal smallint NOT NULL,
  previous_version text NOT NULL,
  attestation text NOT NULL UNIQUE,
  lovable_project_id uuid NOT NULL,
  candidate_sha text NOT NULL CHECK (candidate_sha ~ '^[0-9a-f]{40}$'),
  inventory_sha256 text NOT NULL CHECK (inventory_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (target_ordinal BETWEEN 52 AND ${EXPECTED_MIGRATION_COUNT}),
  CHECK (previous_ordinal = target_ordinal - 1),
  FOREIGN KEY (target_ordinal, target_version)
    REFERENCES ${CONTROL_SCHEMA}.manifest(ordinal, version),
  FOREIGN KEY (previous_ordinal, previous_version)
    REFERENCES ${CONTROL_SCHEMA}.manifest(ordinal, version)
);

INSERT INTO ${CONTROL_SCHEMA}.manifest (
  ordinal, version, filename, file_sha256, git_blob_sha1
) VALUES
${values};

INSERT INTO ${CONTROL_SCHEMA}.state (
  singleton, lovable_project_id, candidate_sha, inventory_sha256
) VALUES (
  true,
  ${sqlLiteral(identity.projectId)}::uuid,
  ${sqlLiteral(identity.candidateSha)},
  ${sqlLiteral(manifest.inventorySha256)}
);

REVOKE ALL ON ALL TABLES IN SCHEMA ${CONTROL_SCHEMA}
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;`;
}

export function buildGatePayload(config, manifest = readLovableMigrationManifest()) {
  const identity = validateIdentity(config);
  const entry = selectMigration(manifest, config.ordinal, config.version);
  const gate = gateForMigration(entry);
  if (!gate) {
    throw new LovableStagingPayloadFailure(
      "phase-gate",
      "the selected migration is not one of the 13 gated post-phase transitions",
    );
  }
  if (config.gateAttestation !== gate.attestation) {
    throw new LovableStagingPayloadFailure(
      "phase-gate",
      `gateAttestation must exactly equal ${gate.attestation}`,
    );
  }

  return `BEGIN;
${transactionPrelude()}
DO $cc_staging_gate$
DECLARE
  v_state ${CONTROL_SCHEMA}.state%ROWTYPE;
  v_previous ${CONTROL_SCHEMA}.manifest%ROWTYPE;
  v_target ${CONTROL_SCHEMA}.manifest%ROWTYPE;
  v_applied_count integer;
BEGIN
  SELECT * INTO STRICT v_state
  FROM ${CONTROL_SCHEMA}.state
  WHERE singleton
  FOR UPDATE;
  SELECT * INTO STRICT v_previous
  FROM ${CONTROL_SCHEMA}.manifest
  WHERE ordinal = ${gate.previousOrdinal};
  SELECT * INTO STRICT v_target
  FROM ${CONTROL_SCHEMA}.manifest
  WHERE ordinal = ${gate.targetOrdinal};
  SELECT count(*) INTO v_applied_count FROM ${CONTROL_SCHEMA}.applied;

  IF v_state.lovable_project_id <> ${sqlLiteral(identity.projectId)}::uuid
     OR v_state.candidate_sha <> ${sqlLiteral(identity.candidateSha)}
     OR v_state.inventory_sha256 <> ${sqlLiteral(manifest.inventorySha256)}
     OR v_state.status <> 'ready'
     OR v_state.current_ordinal <> ${gate.previousOrdinal}
     OR v_previous.version <> ${sqlLiteral(gate.previousVersion)}
     OR v_target.version <> ${sqlLiteral(gate.targetVersion)}
     OR v_applied_count <> ${gate.previousOrdinal}
     OR NOT EXISTS (
       SELECT 1
       FROM ${CONTROL_SCHEMA}.applied applied
       WHERE applied.ordinal = ${gate.previousOrdinal}
         AND applied.version = ${sqlLiteral(gate.previousVersion)}
         AND applied.candidate_sha = ${sqlLiteral(identity.candidateSha)}
     )
     OR EXISTS (
       SELECT 1
       FROM ${CONTROL_SCHEMA}.gate_attestations existing
       WHERE existing.target_ordinal = ${gate.targetOrdinal}
          OR existing.target_version = ${sqlLiteral(gate.targetVersion)}
     )
  THEN
    RAISE EXCEPTION 'lovable staging phase gate mismatch';
  END IF;

  INSERT INTO ${CONTROL_SCHEMA}.gate_attestations (
    target_ordinal,
    target_version,
    previous_ordinal,
    previous_version,
    attestation,
    lovable_project_id,
    candidate_sha,
    inventory_sha256
  ) VALUES (
    ${gate.targetOrdinal},
    ${sqlLiteral(gate.targetVersion)},
    ${gate.previousOrdinal},
    ${sqlLiteral(gate.previousVersion)},
    ${sqlLiteral(gate.attestation)},
    ${sqlLiteral(identity.projectId)}::uuid,
    ${sqlLiteral(identity.candidateSha)},
    ${sqlLiteral(manifest.inventorySha256)}
  );
END;
$cc_staging_gate$;
COMMIT;`;
}

export function buildAttemptPayload(config, manifest = readLovableMigrationManifest()) {
  const identity = validateIdentity(config);
  const attemptNonce = validateAttemptNonce(config.attemptNonce);
  const entry = selectMigration(manifest, config.ordinal, config.version);
  const gateRequirement = requiredGateSql(identity, manifest, entry);
  return `BEGIN;
${transactionPrelude()}
DO $cc_staging_attempt$
DECLARE
  v_state ${CONTROL_SCHEMA}.state%ROWTYPE;
  v_manifest ${CONTROL_SCHEMA}.manifest%ROWTYPE;
  v_applied_count integer;
BEGIN
  SELECT * INTO STRICT v_state
  FROM ${CONTROL_SCHEMA}.state
  WHERE singleton
  FOR UPDATE;
  SELECT * INTO STRICT v_manifest
  FROM ${CONTROL_SCHEMA}.manifest
  WHERE ordinal = ${entry.ordinal};
  SELECT count(*) INTO v_applied_count FROM ${CONTROL_SCHEMA}.applied;

  IF v_state.lovable_project_id <> ${sqlLiteral(identity.projectId)}::uuid
     OR v_state.candidate_sha <> ${sqlLiteral(identity.candidateSha)}
     OR v_state.inventory_sha256 <> ${sqlLiteral(manifest.inventorySha256)}
     OR v_state.status <> 'ready'
     OR v_state.current_ordinal <> ${entry.ordinal - 1}
     OR v_manifest.version <> ${sqlLiteral(entry.version)}
     OR v_manifest.filename <> ${sqlLiteral(entry.filename)}
     OR v_manifest.file_sha256 <> ${sqlLiteral(entry.fileSha256)}
     OR v_manifest.git_blob_sha1 <> ${sqlLiteral(entry.gitBlobSha1)}
     OR v_applied_count <> ${entry.ordinal - 1}${gateRequirement}
  THEN
    RAISE EXCEPTION 'lovable staging migration attempt mismatch';
  END IF;

  UPDATE ${CONTROL_SCHEMA}.state
  SET status = 'executing',
      pending_version = ${sqlLiteral(entry.version)},
      attempt_nonce = ${sqlLiteral(attemptNonce)}::uuid,
      updated_at = clock_timestamp()
  WHERE singleton;
END;
$cc_staging_attempt$;
COMMIT;`;
}

export function buildMigrationPayload(config, manifest = readLovableMigrationManifest()) {
  const identity = validateIdentity(config);
  const attemptNonce = validateAttemptNonce(config.attemptNonce);
  const entry = selectMigration(manifest, config.ordinal, config.version);
  const analysis = analyzeMigrationSql(entry.sql);
  const injectedPrelude = `\n${transactionPrelude()}\n${migrationGuardSql(
    identity,
    manifest,
    entry,
    attemptNonce,
  )}\n`;
  const receipt = `\n${migrationReceiptSql(identity, entry, attemptNonce)}\n`;

  if (analysis.hasOuterTransaction) {
    return entry.sql.slice(0, analysis.beginInsertion)
      + injectedPrelude
      + entry.sql.slice(analysis.beginInsertion, analysis.commitInsertion)
      + receipt
      + entry.sql.slice(analysis.commitInsertion);
  }
  return `BEGIN;${injectedPrelude}${entry.sql}${receipt}COMMIT;`;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || values.has(key)) {
      throw new LovableStagingPayloadFailure("arguments", "options must be unique --name value pairs");
    }
    values.set(key, value);
  }
  const allowed = new Set([
    "--kind",
    "--project-id",
    "--candidate-sha",
    "--ordinal",
    "--version",
    "--attempt-nonce",
    "--gate-attestation",
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new LovableStagingPayloadFailure("arguments", `unknown option ${key}`);
  }
  const kind = values.get("--kind");
  if (!new Set(["bootstrap", "gate", "attempt", "migration"]).has(kind)) {
    throw new LovableStagingPayloadFailure(
      "arguments",
      "--kind must be bootstrap, gate, attempt, or migration",
    );
  }
  const config = {
    projectId: values.get("--project-id"),
    candidateSha: values.get("--candidate-sha"),
  };
  if (kind !== "bootstrap") {
    config.ordinal = Number(values.get("--ordinal"));
    config.version = values.get("--version");
    if (kind === "gate") {
      config.gateAttestation = values.get("--gate-attestation");
    } else {
      config.attemptNonce = values.get("--attempt-nonce");
    }
  }
  return { kind, config };
}

function usage() {
  return [
    "Usage:",
    "  npm run migrate:lovable:payload -- --kind bootstrap --project-id <uuid> --candidate-sha <sha>",
    "  npm run migrate:lovable:payload -- --kind gate --project-id <uuid> --candidate-sha <sha> --ordinal <n> --version <version> --gate-attestation <exact-gate>",
    "  npm run migrate:lovable:payload -- --kind attempt --project-id <uuid> --candidate-sha <sha> --ordinal <n> --version <version> --attempt-nonce <uuid>",
    "  npm run migrate:lovable:payload -- --kind migration --project-id <uuid> --candidate-sha <sha> --ordinal <n> --version <version> --attempt-nonce <uuid>",
  ].join("\n");
}

async function main() {
  try {
    const { kind, config } = parseArguments(process.argv.slice(2));
    const manifest = readLovableMigrationManifest();
    assertGitCandidateManifest(config.candidateSha, manifest);
    const payload = kind === "bootstrap"
      ? buildBootstrapPayload(config, manifest)
      : kind === "gate"
        ? buildGatePayload(config, manifest)
      : kind === "attempt"
        ? buildAttemptPayload(config, manifest)
        : buildMigrationPayload(config, manifest);
    process.stdout.write(`${payload}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    console.error(`Lovable staging payload generation stopped: ${message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
