# Security and trust boundaries

API Gateway terminates public HTTPS. The gateway reaches the internal ALB through VPC Link. Traffic from the ALB to ECS uses private HTTP, constrained by security groups. SQL uses a separate, strict TLS connection. The lab API exposes unauthenticated text reads and writes and returns decrypted text to callers. Use synthetic, nonsensitive data.

## Identities and secrets

| Identity | Responsibility |
| --- | --- |
| GitHub delivery role | Short-lived AWS credentials from OpenID Connect (OIDC) for the intended workflow and environment. Feature PRs have no delivery role. |
| ECS execution role | Fetches the image, initializes logs, and injects the approved Secrets Manager connection-secret version. |
| ECS task role | Calls KMS to encrypt and decrypt application text. Its authority is separate from ECS startup and release administration. |
| SQL runtime login | Reads and writes application records and reads migration metadata. Schema changes use a separate migration identity. |
| SQL backup identities | Perform backup and verification and publish the backup and its manifest to scoped S3/KMS resources. |
| Security administrator | Manages IAM, key policies, secret metadata, and protected storage independently of application delivery. |

Terraform owns secret metadata and access policy. Authorized operators publish secret values outside Terraform. Rotating a connection secret requires coordinating the SQL login and the ECS task revision. A running task continues to use the value injected when it started.

See [delivery permissions](../scripts/api_delivery/permissions.py) and the [operational security reference](../terraform/docs/secrets-strategy.md).

## Encryption and SQL identity

**Application data.** The API uses direct KMS encryption before writing ciphertext to SQL. Reading a page decrypts the selected records in the API. The size bound is 4,096 UTF-8 plaintext bytes. KMS encryption protects stored text. Access to the public API still allows callers to request plaintext.

**SQL transport.** The common non-root image receives trusted public CA material for its environment. Before starting the API, the entrypoint validates the trust configuration. SQL connections require encryption and verify the server certificate and hostname. DEV demonstrated the definitive CA-only trust setup. The runtime role has restricted table access, with deliberate migration as a separate operation.

**Backup storage.** S3 encrypts versioned backup and manifest objects with KMS. SQL backup integrity, the KMS key, secret versions, and server trust material all matter when restoring. See [recovery](recovery.md) and [observed evidence](RESULTS.md).

## Public demo boundary

CloudFront serves a static build from private S3. Text Demo uses browser memory. The public package excludes the AWS proxy and credentials. A Content Security Policy (CSP) blocks API connections, and the diagram viewer runs in an isolated iframe. See [local development](development.md) for the scope of the separate loopback AWS Edition.
