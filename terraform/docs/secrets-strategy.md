# Secret lifecycle for operators

The [security guide](../../docs/security.md) describes the trust and data boundaries. This reference covers configuration and guarded changes.

## Secret-value boundary

Secret values stay out of Terraform state and outputs, source, image layers, command arguments, logs, and public evidence. A Terraform `sensitive` flag only changes display. The security root owns secret metadata, access policies, and key policies. Values are published through authorized operations outside Terraform.

The ECS execution role injects an explicit connection-secret VersionId. Changing a Secrets Manager value leaves SQL logins and existing task injections unchanged. Coordinate logins, the secret version, and task revisions. Qualify new physical SQL connections before replacing the compatible recovery revision.

## TLS and runtime identities

The common image validates environment-supplied public trust material before starting. Use the [SQL trust contract](../../demo-api/deploy/sql-trust/README.md) for manifest preparation and verification. The ordinary runtime requires `validated-v2`, encryption, certificate and hostname checking, and the expected server identity. The one-shot readiness probe calls loopback over HTTP and receives no SQL credential.

The SQL runtime has SELECT/INSERT on DemoTexts and SELECT on migration history. Use a separate migrator for approved schema changes and disable it after handoff. The explicit API operation is `database-migrate --confirm-schema-change`. Startup migrations remain disabled in the strict profile. The SQL host and backup identities retain their own scopes.

## Restore dependencies

Preserve the required backup versions, KMS keys, secret versions, and SQL trust inputs together. The [backup runbook](../../operations/sql-backup/README.md) explains retention and exact-version verification. An encrypted backup remains unusable without its decryption and access dependencies.

See the [security root](../infra/security/README.md), [delivery permissions](../../scripts/api_delivery/permissions.py), and [infrastructure security and validation](e1-final-acceptance.md) for machine-enforced authority contracts.
