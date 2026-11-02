import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
const state = JSON.parse(readFileSync(".afterlife/aws/resources.json", "utf8"));
const file = process.argv[2];
if (!file) throw new Error("Pass a reviewed shell-script path.");
const params = ".afterlife/aws/run-command.json";
writeFileSync(
  params,
  JSON.stringify({
    commands: [readFileSync(file, "utf8")],
    executionTimeout: ["1200"],
  }),
  { mode: 0o600 },
);
const aws = (args) =>
  JSON.parse(
    execFileSync(
      "aws",
      [...args, "--region", state.region, "--output", "json", "--no-cli-pager"],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
const id = aws([
  "ssm",
  "send-command",
  "--instance-ids",
  state.instanceId,
  "--document-name",
  "AWS-RunShellScript",
  "--parameters",
  "file://" + params,
  "--timeout-seconds",
  "600",
]).Command.CommandId;
writeFileSync(
  ".afterlife/aws/latest-command.json",
  JSON.stringify({ id, instance: state.instanceId, file }),
  { mode: 0o600 },
);
console.log("Systems Manager command " + id);
for (let i = 0; i < 400; i++) {
  await setTimeout(3000);
  let r;
  try {
    r = aws([
      "ssm",
      "get-command-invocation",
      "--command-id",
      id,
      "--instance-id",
      state.instanceId,
    ]);
  } catch {
    continue;
  }
  if (["Pending", "InProgress", "Delayed"].includes(r.Status)) continue;
  writeFileSync(
    ".afterlife/aws/latest-remote-output.log",
    r.StandardOutputContent + "\n" + r.StandardErrorContent,
    { mode: 0o600 },
  );
  console.log("Command status: " + r.Status);
  console.log(r.StandardOutputContent.slice(-6000));
  if (r.Status !== "Success") {
    console.error(r.StandardErrorContent.slice(-2500));
    process.exit(1);
  }
  process.exit(0);
}
throw new Error("SSM operation still running; inspect latest-command.json.");
