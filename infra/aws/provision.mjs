import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const work = resolve(root, ".afterlife/aws");
mkdirSync(work, { recursive: true, mode: 0o700 });
const stateFile = resolve(work, "resources.json");
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : { region: process.env.AWS_REGION || "us-east-1", name: "afterlife-prod" };
const save = () =>
  writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
const input = (name, value) => {
  const path = resolve(work, name + ".json");
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return "file://" + path;
};
function aws(service, operation, args = []) {
  const out = execFileSync(
    "aws",
    [
      service,
      operation,
      ...args,
      "--region",
      state.region,
      "--output",
      "json",
      "--no-cli-pager",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return out.trim() ? JSON.parse(out) : {};
}
const identity = aws("sts", "get-caller-identity");
if (state.account && state.account !== identity.Account)
  throw new Error("AWS account differs from saved deployment.");
state.account = identity.Account;
save();
const tags = [
  { Key: "Project", Value: "AFTERLIFE" },
  { Key: "ManagedBy", Value: "afterlife-aws-cli" },
];
const tagResource = (type) => ({ ResourceType: type, Tags: tags });
if (process.argv[2] === "provision") {
  const vpcs = aws("ec2", "describe-vpcs", [
    "--filters",
    "Name=is-default,Values=true",
  ]).Vpcs;
  if (vpcs.length !== 1)
    throw new Error("Expected one default VPC; no existing VPC modified.");
  state.vpcId = vpcs[0].VpcId;
  const zones = aws("ec2", "describe-availability-zones").AvailabilityZones;
  const subnets = aws("ec2", "describe-subnets", [
    "--filters",
    `Name=vpc-id,Values=${state.vpcId}`,
  ]).Subnets;
  const subnet = subnets.find(
    (s) =>
      s.MapPublicIpOnLaunch &&
      zones.find((z) => z.ZoneName === s.AvailabilityZone)?.ZoneId !==
        "use1-az3",
  );
  if (!subnet)
    throw new Error("No suitable existing public subnet for outbound access.");
  state.subnetId = subnet.SubnetId;
  if (!state.repository) {
    const r = aws("ecr", "create-repository", [
      "--repository-name",
      state.name,
      "--image-tag-mutability",
      "IMMUTABLE",
      "--image-scanning-configuration",
      "scanOnPush=true",
      "--tags",
      JSON.stringify(tags),
    ]).repository;
    state.repository = r.repositoryUri;
    state.repositoryArn = r.repositoryArn;
    save();
  }
  if (!state.bucket) {
    const name = `afterlife-${state.account}-${state.region}-deploy`;
    const args = ["--bucket", name];
    if (state.region !== "us-east-1")
      args.push(
        "--create-bucket-configuration",
        `LocationConstraint=${state.region}`,
      );
    aws("s3api", "create-bucket", args);
    state.bucket = name;
    save();
  }
  {
    const name = state.bucket;
    aws("s3api", "put-public-access-block", [
      "--bucket",
      name,
      "--public-access-block-configuration",
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
    ]);
    aws("s3api", "put-bucket-encryption", [
      "--bucket",
      name,
      "--server-side-encryption-configuration",
      JSON.stringify({
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
            BucketKeyEnabled: true,
          },
        ],
      }),
    ]);
    aws("s3api", "put-bucket-versioning", [
      "--bucket",
      name,
      "--versioning-configuration",
      "Status=Enabled",
    ]);
    aws("s3api", "put-bucket-policy", [
      "--bucket",
      name,
      "--policy",
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "RequireTLS",
            Effect: "Deny",
            Principal: "*",
            Action: "s3:*",
            Resource: [`arn:aws:s3:::${name}`, `arn:aws:s3:::${name}/*`],
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          },
        ],
      }),
    ]);
  }
  if (!state.secretArn) {
    const secret = { dbPassword: randomBytes(32).toString("hex") };
    const request = {
      Name: state.name + "/runtime",
      SecretString: JSON.stringify(secret),
      Tags: tags,
    };
    try {
      state.secretArn = aws("secretsmanager", "create-secret", [
        "--cli-input-json",
        input("secret-create", request),
      ]).ARN;
      save();
    } finally {
      unlinkSync(resolve(work, "secret-create.json"));
    }
  }
  if (!state.roleName) {
    const name = state.name + "-node";
    const role = aws("iam", "create-role", [
      "--role-name",
      name,
      "--assume-role-policy-document",
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
      "--tags",
      JSON.stringify(tags),
    ]).Role;
    state.roleName = name;
    state.roleArn = role.Arn;
    save();
  }
  {
    const name = state.roleName;
    aws("iam", "attach-role-policy", [
      "--role-name",
      name,
      "--policy-arn",
      "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    ]);
    aws("iam", "put-role-policy", [
      "--role-name",
      name,
      "--policy-name",
      "AfterlifeDeploymentArtifacts",
      "--policy-document",
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue"],
            Resource: state.secretArn,
          },
          {
            Effect: "Allow",
            Action: ["ecr:GetAuthorizationToken"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
            ],
            Resource: state.repositoryArn,
          },
          {
            Effect: "Allow",
            Action: ["s3:GetObject"],
            Resource: `arn:aws:s3:::${state.bucket}/*`,
          },
        ],
      }),
    ]);
    state.profileName = name;
    const profiles = aws("iam", "list-instance-profiles").InstanceProfiles;
    let profile = profiles.find((p) => p.InstanceProfileName === name);
    if (!profile)
      profile = aws("iam", "create-instance-profile", [
        "--instance-profile-name",
        name,
        "--tags",
        JSON.stringify(tags),
      ]).InstanceProfile;
    if (profile.Roles.some((r) => r.RoleName !== name))
      throw new Error(
        "Deployment instance profile contains an unexpected role.",
      );
    if (!profile.Roles.some((r) => r.RoleName === name))
      aws("iam", "add-role-to-instance-profile", [
        "--instance-profile-name",
        name,
        "--role-name",
        name,
      ]);
    save();
  }
  if (!state.securityGroupId) {
    state.securityGroupId = aws("ec2", "create-security-group", [
      "--group-name",
      state.name + "-origin",
      "--description",
      "AFTERLIFE web host; no inbound SSH or database",
      "--vpc-id",
      state.vpcId,
      "--tag-specifications",
      JSON.stringify([tagResource("security-group")]),
    ]).GroupId;
    save();
  }
  if (!state.instanceId) {
    state.launchToken ??= randomBytes(24).toString("hex");
    save();
    const ami = aws("ssm", "get-parameter", [
      "--name",
      "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
    ]).Parameter.Value;
    const userData = readFileSync("infra/aws/user-data.sh");
    const launch = {
      ClientToken: state.launchToken,
      ImageId: ami,
      InstanceType: "t3.small",
      MinCount: 1,
      MaxCount: 1,
      IamInstanceProfile: { Name: state.profileName },
      MetadataOptions: {
        HttpTokens: "required",
        HttpEndpoint: "enabled",
        HttpPutResponseHopLimit: 1,
      },
      CreditSpecification: { CpuCredits: "standard" },
      BlockDeviceMappings: [
        {
          DeviceName: "/dev/xvda",
          Ebs: {
            VolumeSize: 32,
            VolumeType: "gp3",
            Encrypted: true,
            DeleteOnTermination: false,
          },
        },
      ],
      NetworkInterfaces: [
        {
          DeviceIndex: 0,
          AssociatePublicIpAddress: true,
          DeleteOnTermination: true,
          SubnetId: state.subnetId,
          Groups: [state.securityGroupId],
        },
      ],
      UserData: userData.toString("base64"),
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [...tags, { Key: "Name", Value: state.name }],
        },
        tagResource("volume"),
      ],
    };
    let created;
    for (let i = 0; i < 6; i++) {
      try {
        created = aws("ec2", "run-instances", [
          "--cli-input-json",
          input("instance-create", launch),
        ]);
        break;
      } catch (e) {
        if (i === 5) throw e;
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
    state.instanceId = created.Instances[0].InstanceId;
    save();
    console.log("Created isolated application instance " + state.instanceId);
  }
  aws("ec2", "wait", ["instance-running", "--instance-ids", state.instanceId]);
  const instance = aws("ec2", "describe-instances", [
    "--instance-ids",
    state.instanceId,
  ]).Reservations[0].Instances[0];
  state.privateDns = instance.PrivateDnsName;
  state.publicIp = instance.PublicIpAddress;
  save();
  console.log(
    JSON.stringify({
      instanceId: state.instanceId,
      repository: state.repository,
      bucket: state.bucket,
    }),
  );
} else if (process.argv[2] === "status") {
  console.log(
    JSON.stringify({
      instanceId: state.instanceId,
      hostingMode: state.hostingMode,
      url: state.origin,
    }),
  );
} else throw new Error("Usage: node infra/aws/provision.mjs provision|status");
