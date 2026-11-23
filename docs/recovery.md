# Network and database recovery

The lab exercises two recovery mechanisms. NAT egress is restored automatically after an instance replacement. SQL data is recovered through a supervised backup restore. Both were tested in DEV.

## Automatic NAT Recovery

Each Availability Zone uses a NAT instance managed by its own Auto Scaling group. EventBridge triggers dedicated Lambda handlers when a replacement instance launches:

1. Associate the zone's Elastic IP (EIP) with the replacement instance.
2. Point the private default route at the replacement network interface.
3. Disable EC2 source/destination checking so the instance can forward traffic.

Instance bootstrap enables IP forwarding and address translation. The handlers verify the replacement and its scope before acting. Event delivery and asynchronous execution have separate failure destinations for investigation. Recovery restores egress within the affected zone. Forwarding evidence comes from a private subnet request that traverses the repaired path.

See the [handler implementation](../scripts/recovery/nat.py), [instance bootstrap](../scripts/nat/user_data.sh), and [operator runbook](../terraform/docs/e13-nat-reliability.md).

## Hourly SQL backups

A persistent systemd timer runs the native backup producer on the SQL EC2 host. The producer creates a copy-only backup with checksums, verifies it with SQL Server, and publishes the backup and manifest to versioned S3 with KMS encryption. The manifest and receipt bind object versions, size, and SHA-256. A recovery uses a verified pair protected from retention expiry.

The producer, storage checks, and supervised restore have distinct responsibilities. A scheduled backup establishes an hourly objective. Recovery after abrupt loss still depends on the last usable backup. See the [backup runbook](../operations/sql-backup/README.md) and [storage operations](../operations/sql-backup/storage/README.md).

## Supervised SQL recovery

1. Drain application writes and positively fence the original SQL writer. For a planned recovery, produce a final verified backup.
2. Provision a new EC2 instance in the same or another Availability Zone. Preserve the original encrypted volume and verify isolation of the old host.
3. Restore the exact backup versions. Run `DBCC CHECKDB` and verify the recovered data and migration state.
4. Qualify the new SQL endpoint and trust configuration. Enable the new writer, update the application connection secret and task revision, and verify the API through SQL and KMS.

SQL remains a single-writer system. Recovery uses full-backup restore points and requires an operator. Same-zone and cross-zone trials measured time to a verified API round trip. See the [results](RESULTS.md) for times and the [operator recovery checks](../operations/sql-backup/README.md#current-tls-prerequisite-for-another-cold-recovery) for prerequisites that apply to a new trial.
