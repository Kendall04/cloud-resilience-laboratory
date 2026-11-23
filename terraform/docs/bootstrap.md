# Operator guide

Start with the [technical guides](../../docs/README.md) for the system design. Select the smallest applicable procedure and keep one authorized writer per resource.

| Operation | Procedure |
| --- | --- |
| Release, rollback, or reconcile the API | [Release operations](deployment.md). Application delivery owns ECS revisions/counts and ALB traffic. |
| Plan, apply, or retire a DEV infrastructure layer | [Native DEV lifecycle](native-dev-lifecycle.md). Use live scope, reviewed inputs, the existing backend, and normal locking. |
| Change identities, trust, or connection secrets | [Secret lifecycle](secrets-strategy.md) and [security root](../infra/security/README.md). |
| Diagnose a backup failure | [SQL backup runbook](../../operations/sql-backup/README.md). Check the timer, exact object versions, and private receipt. |
| Replace the SQL writer | [Cold recovery prerequisites](../../operations/sql-backup/README.md#current-tls-prerequisite-for-another-cold-recovery). Confirm writer exclusion, verified backups, and current TLS first. |
| Diagnose NAT replacement | [NAT instance recovery](e13-nat-reliability.md). Inspect group membership, forwarding, IP association, route and failure queues. |
| Update the independent public demo | [Static hosting runbook](../../portfolio/product/HOSTING.md). Publication has its own authorization and rollback. |

## Before an AWS operation

Verify account, region, environment, identity, and effective grants together. Read current resource membership, state serial, versions, locks, and competing writers. A dated observation, old plan, or historical allowance cannot establish current scope. Keep the keys, backups, versions, and recovery dependencies needed by retained data.

Distinguish observer signals from recovery. CloudWatch logs and alarm definitions can support diagnosis. Confirm actual notification delivery separately. The retired observer does not operate the NAT handlers or the native SQL timer.

Use [validation and command effects](validation.md) before running checks. The [infrastructure security and validation contract](e1-final-acceptance.md) governs approved source and retired fixtures.
