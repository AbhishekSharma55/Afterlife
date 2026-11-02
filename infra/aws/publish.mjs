import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const state = JSON.parse(readFileSync(".afterlife/aws/resources.json", "utf8"));
const target = ".afterlife/aws/images.json";
const suffix = Date.now().toString();
const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
const images =
  existsSync(target) && !process.argv.includes("--new-release")
    ? JSON.parse(readFileSync(target, "utf8"))
    : {
        app: state.repository + ":app-" + revision + "-" + suffix,
        postgres: state.repository + ":postgres17-" + suffix,
        caddy: state.repository + ":caddy-" + suffix,
      };
writeFileSync(target, JSON.stringify(images, null, 2), { mode: 0o600 });
const password = execFileSync(
  "aws",
  ["ecr", "get-login-password", "--region", state.region],
  { encoding: "utf8" },
);
execFileSync(
  "docker",
  [
    "login",
    "--username",
    "AWS",
    "--password-stdin",
    state.repository.split("/")[0],
  ],
  { input: password, stdio: ["pipe", "ignore", "ignore"] },
);
execFileSync("docker", ["pull", "caddy:2-alpine"], { stdio: "inherit" });
execFileSync("docker", ["pull", "postgres:17-bookworm"], { stdio: "inherit" });
for (const [source, destination] of [
  ["afterlife-aws:" + revision, images.app],
  ["postgres:17-bookworm", images.postgres],
  ["caddy:2-alpine", images.caddy],
]) {
  execFileSync("docker", ["tag", source, destination]);
  execFileSync("docker", ["push", destination], { stdio: "inherit" });
}
console.log("Published immutable application, PostgreSQL and proxy images.");
