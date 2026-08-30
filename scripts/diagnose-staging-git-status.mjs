import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
  stdio: "pipe",
});

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
console.log(`git-status-exit=${result.status}`);
console.log(`git-status-stdout=${JSON.stringify(stdout)}`);
console.log(`git-status-stderr=${JSON.stringify(stderr)}`);
if (result.error || result.status !== 0) process.exitCode = 1;
