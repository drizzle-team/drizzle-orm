/// <reference path="./.sst/platform/config.d.ts" />

// SST v3 app: a scale-to-zero Aurora Serverless v2 PostgreSQL cluster with the RDS Data API enabled, for
// testing minipg/aurora. Uses the account's DEFAULT VPC (FREE) instead of provisioning a new SST Vpc (which
// adds a ~$0.50/mo CloudMap namespace). Aurora requires a VPC, but the Data API is reached over the public
// AWS endpoint, so any subnets work. Idle cost ≈ $0: `min: "0 ACU"` auto-pauses after 5 min of no activity.
//
// Deploy (AWS creds in the env):
//   bun install
//   set -a; source ../../.env; set +a          # AWS_* creds + region
//   bunx sst deploy                             # ~10-15 min the first time
//   # copy the printed AURORA_RESOURCE_ARN / AURORA_SECRET_ARN / AURORA_DATABASE into ../../.env
// Tear down: bunx sst remove
export default $config({
  app() {
    return {
      name: 'minipg-aurora-test',
      removal: 'remove', // full teardown on `sst remove` (throwaway test stack)
      protect: false,
      home: 'aws',
      providers: { aws: { region: process.env.AWS_REGION || 'us-east-1' } },
    }
  },
  async run() {
    // The account's default VPC — free, and Aurora + Data API don't need any special networking.
    const vpc = aws.ec2.getVpcOutput({ default: true })
    const subnets = aws.ec2.getSubnetsOutput({ filters: [{ name: 'vpc-id', values: [vpc.id] }] })
    const sg = aws.ec2.getSecurityGroupOutput({ vpcId: vpc.id, name: 'default' })

    const db = new sst.aws.Aurora('MinipgAurora', {
      engine: 'postgres',
      dataApi: true,
      scaling: { min: '0 ACU', max: '4 ACU', pauseAfter: '5 minutes' },
      vpc: { subnets: subnets.ids, securityGroups: [sg.id] },
    })

    // output names match the .env vars, so they're easy to copy across after deploy
    return {
      AURORA_RESOURCE_ARN: db.clusterArn,
      AURORA_SECRET_ARN: db.secretArn,
      AURORA_DATABASE: db.database,
    }
  },
})
