import { Effect, IRole, PolicyStatement } from 'aws-cdk-lib/aws-iam';

const createSourceIpCondition = (
  allowedIpV4AddressRanges?: string[] | null,
  allowedIpV6AddressRanges?: string[] | null
) =>
  // Empty arrays are truthy: guarding on the arrays themselves emitted
  // IpAddress: { aws:SourceIp: [] } - a condition that never matches, which
  // turned the ALLOW statement into a no-op and broke every KB document
  // download on deployments without IP restrictions.
  (allowedIpV4AddressRanges?.length ?? 0) +
    (allowedIpV6AddressRanges?.length ?? 0) >
  0
    ? {
        IpAddress: {
          'aws:SourceIp': [
            ...(allowedIpV4AddressRanges ?? []),
            ...(allowedIpV6AddressRanges ?? []),
          ],
        },
      }
    : undefined;

export const allowS3AccessWithSourceIpCondition = (
  bucketName: string,
  role: IRole,
  accessType: 'read' | 'write',
  ipConditions?: {
    ipv4?: string[] | null;
    ipv6?: string[] | null;
  }
) => {
  role.addToPrincipalPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      resources: [`arn:aws:s3:::${bucketName}`, `arn:aws:s3:::${bucketName}/*`],
      actions:
        accessType === 'read'
          ? ['s3:GetBucket*', 's3:GetObject*', 's3:List*']
          : ['s3:Abort*', 's3:DeleteObject*', 's3:PutObject*'],
      conditions: createSourceIpCondition(
        ipConditions?.ipv4,
        ipConditions?.ipv6
      ),
    })
  );
};
