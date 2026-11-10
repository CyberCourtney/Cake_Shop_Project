#!/usr/bin/env node
// Starts DynamoDB Local (Java) on port 8000, creates the table exactly as data.yaml does,
// and seeds it. Used by `npm run dev:db` and the integration tests. Needs Java and the
// DynamoDB Local jar (path in DYNAMODB_LOCAL_DIR). Data is in memory and lost on exit.
import { spawn } from "node:child_process";
import { createTable } from "./table.mjs";

const dir = process.env.DYNAMODB_LOCAL_DIR;
if (!dir) {
  console.error("Set DYNAMODB_LOCAL_DIR to the folder containing DynamoDBLocal.jar (see docs/local-development.md).");
  process.exit(1);
}
const proc = spawn("java", ["-Djava.library.path=./DynamoDBLocal_lib", "-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb", "-port", "8000"], { cwd: dir, stdio: "inherit" });
// Java takes a few seconds to start; keep trying until it answers.
for (let i = 0; ; i++) {
  try {
    await createTable("http://localhost:8000", "kvc-local-main");
    break;
  } catch (err) {
    if (i > 30) throw err;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
spawn("node", ["scripts/seed-catalogue.mjs", "--table", "kvc-local-main", "--endpoint", "http://localhost:8000"], {
  stdio: "inherit",
  env: { ...process.env, AWS_ACCESS_KEY_ID: "local", AWS_SECRET_ACCESS_KEY: "local" },
});
console.log("DynamoDB Local is running on http://localhost:8000 (Ctrl+C to stop).");
process.on("SIGINT", () => { proc.kill(); process.exit(0); });
