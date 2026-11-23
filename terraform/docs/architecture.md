# Application and infrastructure contracts

Start with the [platform architecture](../../docs/architecture.md) for the request flow and ownership map. This reference describes interfaces and configuration that matter to changes in the application or runtime.

## CURRENT CONTRACT — application and data

| Interface | Behavior |
| --- | --- |
| `POST /text` | Reject blank input and plaintext over 4,096 UTF-8 bytes. Encrypt accepted bytes with KMS, store base64 ciphertext, and return the plaintext DTO. |
| `GET /text` | Read and decrypt one page ordered by descending CreatedAt and unique Id. Default page size 50, maximum 100, with up to ten concurrent decrypts per request. |
| `/health`, `/health/live` | Process liveness. |
| `/ready`, `/health/ready` | SQL connectivity, pending migrations, and KMS Encrypt. |
| Swagger | ASP.NET Development only. |

Blank validation takes precedence over byte length. The limit counts UTF-8 bytes, including multibyte characters. An oversized POST returns HTTP 400 with `Text must not exceed 4096 UTF-8 bytes.` before calling KMS. Page numbers start at 1 and size is 1–100. Offsets above `int.MaxValue` return HTTP 400 with `Page is too large for the requested PageSize.` before repository or decryption work. Representable pages beyond the result set return a 200 empty array. Ordering resolves ties for a fixed dataset. Concurrent writes can change offset pagination. A decryption failure fails the request.

The API requires `DB_CONN_STRING` outside Development. `KMS_KEY_ID` selects the key and the SDK uses the runtime credential chain. `APP_ENV` and `DEPLOYMENT` do not set the ASP.NET environment. Gateway authorization is `NONE`. CORS is disabled by default and is separate from authorization.

The non-root Linux container runs as UID 1654 on port 8080. The ordinary API requires the strict SQL TLS profile, identified in code as `validated-v2`. SQL Server 2022 Express runs on EC2 as one writer. The runtime login has SELECT/INSERT on DemoTexts and SELECT on EF migration history. Schema changes use the separate migrator. Startup migrations default off and the strict profile refuses them.

See [controller](../../demo-api/terragrunt-demo/Controllers/DemoTextController.cs), [repository](../../demo-api/terragrunt-demo/Repositories/ITextRepository.cs), [encryption](../../demo-api/terragrunt-demo/Services/IEncryptionService.cs), and [SQL trust](../../demo-api/deploy/sql-trust/README.md).

## Runtime and ownership checks

Each task has an essential API container and a nonessential one-shot readiness probe running the same digest. The probe calls loopback `/ready` and must exit successfully. Only the API connects to SQL. The executor checks the candidate revision, task identities, target health, and client readiness before and after shifting traffic. ALB process health has a separate scope from SQL/KMS readiness.

Use the [Data owner](../modules/target/dev/data/ordinary-main.tf) for SQL subnet selection and `recovery_preserve_root_volume`. Leave service revisions/counts, ALB forwarding, and NAT route repair to their designated writers. Follow [release operations](deployment.md), [native lifecycle](native-dev-lifecycle.md), and [infrastructure security and validation](e1-final-acceptance.md) when modifying those contracts.
