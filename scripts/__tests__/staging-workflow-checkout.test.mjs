import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/staging-migration-phase.yml", import.meta.url), "utf8");

test("staging workflow does not persist checkout credentials into reviewed candidate", () => {
  assert.match(workflow, /ref: \$\{\{ inputs\.candidate_sha \}\}[\s\S]*persist-credentials: false/);
});

test("staging workflow still verifies exact candidate and clean worktree", () => {
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$\{\{ inputs\.candidate_sha \}\}"/);
  assert.match(workflow, /git status --porcelain=v1 --untracked-files=all/);
});
