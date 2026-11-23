# SQL backup operations

The [recovery guide](../../docs/recovery.md) explains backup and restore design. Use this runbook for integrity, producer troubleshooting, and qualification before a new cold recovery.

## Producer and integrity

The SQL host uses `sql-backup.timer` and the native `host.py` producer. The [.NET backup CLI](SqlBackup) creates copy-only backups with checksums, runs SQL verification, and publishes backup and manifest pairs to versioned S3 with KMS encryption. Success binds both object versions, byte length, and SHA-256.

`host.py run --config <config> --executable <absolute-binary>` holds a private lock across backup and cleanup. Cleanup requires `REMOTE_VERIFIED`. Systemd supplies separate backup and verification connections. Only the backup child receives those values. AWS access uses the EC2 instance role and checks the account and identity. The timer requires SQL to be running. Its persistence permits one catch-up activation.

## Diagnose an interrupted or failed run

Inspect the timer and service, the private last-job receipt, and bounded logs. Check SQL availability, staging space, role and KMS access, and the last verified backup pair. An API that continues serving can still have a failed backup.

`host.py inhibit --config <config> --wait-seconds 600` prevents new wrapper runs and waits without killing the current job. A timeout leaves inhibition in place. `status` reports wrapper state. `resume` is explicit. An interrupted `STARTED` or `UNKNOWN` operation requires reconciliation because local idleness does not establish that SQL or remote writes stopped.

## Retention and package integrity

Local cleanup retains two verified backups by default. It rechecks the exact remote versions, manifest, KMS identity, and hashes before removing an older locally owned copy. Failed or foreign directories require review.

The seven-day S3 Lifecycle rule processes admitted versions. The two newest verified pairs and restore holds stay protected. New or untagged versions require explicit admission. See [storage verification, retention, and holds](storage/README.md). Preserve the required KMS keys, secret versions, and trust material with the backups.

The [package builder and installer](package.py) validate source identity, file hashes, modes, and archive safety. The installer previews by default. A real install needs the reviewed package hash, approved public configuration, and explicit confirmation. It does not enable the timer. Use `local_release.py` and `verify-bundle` to bind the actual payload to its reviewed source.

## Current TLS prerequisite for another cold recovery

The [authenticated cold recovery runbook](recovery/NATIVE-RECOVERY.md) records the demonstrated procedure. Its TLS step uses the original fingerprint-pinned installer, which accepts the old laboratory leaf. Before interrupting SQL under the strict CA-only profile, qualify the replacement certificate and its confidential installation path using the [current trust contract](../../demo-api/deploy/sql-trust/README.md#root-only-completion). The definitive CA delivery and the cold recovery trials are separate evidence.

Exclude competing application writers with the [current handover and maintenance procedure](../../terraform/docs/deployment.md). Use the native producer and exact remote receipt for the final backup. Preserve positive source fencing and recovered-data verification before enabling a new writer.

[Results](../../docs/RESULTS.md) record both observed restore durations. [Offline checks](../../terraform/docs/validation.md) cover the code contracts. Backup execution, retention admission, restore holds, and live restoration each have separate operational effects.
