import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const path = ".afterlife/aws/resources.json";
const s = JSON.parse(readFileSync(path));
const save = () =>
  writeFileSync(path, JSON.stringify(s, null, 2), { mode: 0o600 });
const aws = (service, op, args = []) => {
  const r = execFileSync(
    "aws",
    [
      service,
      op,
      ...args,
      "--region",
      s.region,
      "--output",
      "json",
      "--no-cli-pager",
    ],
    { encoding: "utf8" },
  );
  return r.trim() ? JSON.parse(r) : {};
};
const attachments = aws("ec2", "describe-network-interfaces", [
  "--filters",
  `Name=group-id,Values=${s.securityGroupId}`,
]).NetworkInterfaces;
if (attachments.some((n) => n.Attachment?.InstanceId !== s.instanceId))
  throw new Error(
    "Origin security group has an unexpected attachment; not modifying.",
  );
if (!s.allocationId) {
  const a = aws("ec2", "allocate-address", [
    "--domain",
    "vpc",
    "--tag-specifications",
    JSON.stringify([
      {
        ResourceType: "elastic-ip",
        Tags: [
          { Key: "Project", Value: "AFTERLIFE" },
          { Key: "Name", Value: s.name },
        ],
      },
    ]),
  ]);
  s.allocationId = a.AllocationId;
  s.publicIp = a.PublicIp;
  save();
}
aws("ec2", "associate-address", [
  "--instance-id",
  s.instanceId,
  "--allocation-id",
  s.allocationId,
]);
if (!s.publicHttpsIngress) {
  aws("ec2", "authorize-security-group-ingress", [
    "--group-id",
    s.securityGroupId,
    "--ip-permissions",
    JSON.stringify([
      {
        IpProtocol: "tcp",
        FromPort: 80,
        ToPort: 80,
        IpRanges: [
          {
            CidrIp: "0.0.0.0/0",
            Description: "Public HTTP redirect and ACME certificate validation",
          },
        ],
      },
      {
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        IpRanges: [
          { CidrIp: "0.0.0.0/0", Description: "Public HTTPS application" },
        ],
      },
    ]),
  ]);
  s.publicHttpsIngress = true;
  save();
}
s.origin = "https://afterlife." + s.publicIp.replaceAll(".", "-") + ".sslip.io";
s.hostingMode = "direct-https";
s.cloudfrontBlocked = "Account verification required before CreateDistribution";
save();
console.log(
  JSON.stringify({
    url: s.origin,
    callback: s.origin + "/auth/twitch/callback",
    instanceId: s.instanceId,
  }),
);
