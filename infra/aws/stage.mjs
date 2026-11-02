import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
const s = JSON.parse(readFileSync(".afterlife/aws/resources.json"));
const dir = ".afterlife/aws/bundle";
mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const f of [
  "compose.yaml",
  "Caddyfile.template",
  "configure.py",
  "backup.sh",
])
  copyFileSync("infra/aws/" + f, dir + "/" + f);
copyFileSync(".afterlife/aws/images.json", dir + "/images.json");
writeFileSync(
  dir + "/deploy-meta.json",
  JSON.stringify({
    region: s.region,
    bucket: s.bucket,
    secretArn: s.secretArn,
  }),
  { mode: 0o600 },
);
execFileSync("tar", [
  "-czf",
  ".afterlife/aws/deployment.tar.gz",
  "-C",
  dir,
  "compose.yaml",
  "Caddyfile.template",
  "configure.py",
  "backup.sh",
  "images.json",
  "deploy-meta.json",
]);
execFileSync("aws", [
  "s3",
  "cp",
  ".afterlife/aws/deployment.tar.gz",
  `s3://${s.bucket}/deploy/deployment.tar.gz`,
  "--region",
  s.region,
  "--sse",
  "AES256",
  "--only-show-errors",
]);
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["s3:PutObject"],
      Resource: `arn:aws:s3:::${s.bucket}/backups/*`,
    },
  ],
};
execFileSync("aws", [
  "iam",
  "put-role-policy",
  "--role-name",
  s.roleName,
  "--policy-name",
  "AfterlifeDailyBackups",
  "--policy-document",
  JSON.stringify(policy),
]);
const lifecycle = {
  Rules: [
    {
      ID: "ExpireDailyBackupsAfter14Days",
      Status: "Enabled",
      Filter: { Prefix: "backups/" },
      Expiration: { Days: 14 },
      NoncurrentVersionExpiration: { NoncurrentDays: 1 },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
  ],
};
execFileSync("aws", [
  "s3api",
  "put-bucket-lifecycle-configuration",
  "--bucket",
  s.bucket,
  "--lifecycle-configuration",
  JSON.stringify(lifecycle),
  "--region",
  s.region,
]);
const script = `#!/bin/bash\nset -euo pipefail\numask 077\ninstall -d -m 700 /srv/afterlife\ncd /srv/afterlife\naws s3 cp s3://${s.bucket}/deploy/deployment.tar.gz /srv/afterlife/deployment.tar.gz --region ${s.region} --only-show-errors\ntar -xzf deployment.tar.gz\naws ecr get-login-password --region ${s.region} | docker login --username AWS --password-stdin ${s.repository.split("/")[0]} >/dev/null 2>&1\npython3 - <<'PY'\nimport json, subprocess\nfor image in json.load(open('images.json')).values():\n    subprocess.run(['docker','pull',image],check=True,stdout=subprocess.DEVNULL)\nprint('All production images cached.')\nPY\n`;
writeFileSync(".afterlife/aws/remote-stage.sh", script, { mode: 0o600 });
console.log(
  "Deployment bundle uploaded; backup permissions and retention configured.",
);
