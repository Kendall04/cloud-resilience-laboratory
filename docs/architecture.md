# Architecture

The application accepts short text, encrypts it before persistence, and decrypts it on retrieval. The laboratory places that simple API behind a private runtime so that delivery, dependency readiness, and recovery can be observed through the same end-to-end path.

## Request and data flow

| Component | Responsibility |
| --- | --- |
| API Gateway HTTP API | Public HTTPS entry point. A VPC Link forwards requests to an internal Application Load Balancer (ALB). |
| Internal ALB | Routes to the active blue or green ECS task group. Each color can serve from either private application subnet. |
| ECS Fargate | Runs the .NET 10 API. The API calls AWS KMS for text encryption and decryption and opens strict TLS connections to SQL. |
| SQL Server Express on EC2 | Stores ciphertext. A single database writer serves both ECS colors. |
| AWS Secrets Manager | Supplies the selected connection secret version to the ECS execution role. |
| Versioned S3 | Stores encrypted backup and manifest pairs and separate application release records. |
| CloudFront and private S3 | Serve the independent static demo. Text Demo uses synthetic data in memory. |

`POST /text` encrypts accepted text and persists ciphertext. `GET /text` retrieves and decrypts a page of records. The direct KMS encryption path accepts up to 4,096 UTF-8 bytes. `/health` reports process liveness. `/ready` checks SQL availability and migration state and exercises KMS encryption. The [API contract](../terraform/docs/architecture.md#current-contract--application-and-data) lists paging, status, and validation behavior.

## Network layout

The VPC spans two Availability Zones. Each has a public NAT instance and private subnets serving application or data workloads. Security groups restrict the path from VPC Link to ALB to ECS to SQL. Tasks have no public IPs. Outbound access to public AWS service endpoints uses the NAT instance for that zone. SQL placement is an explicit Data-layer input and the database remains single-writer.

See [network configuration](../terraform/modules/target/dev/global), [API Gateway and VPC Link](../terraform/modules/target/dev/edge), and [NAT and SQL recovery](recovery.md).

## Infrastructure and release ownership

The DEV network, edge, database, and ECS layers use separate native Terraform roots. The protected security root uses Terragrunt and owns IAM, key policies, secret metadata, and protected storage. Terraform provisions the ECS and ALB skeleton. The delivery executor owns task revisions, service counts, and ALB forwarding during an application release. The NAT handlers own private default-route repair on instance replacement.

Keeping one writer per mutable field prevents an infrastructure reconciliation from overwriting an application release or undoing NAT repair. [Infrastructure operations](../terraform/docs/native-dev-lifecycle.md), [delivery](delivery.md), and [security](security.md) describe those boundaries in more detail.

## Explore the design

The [Architecture Explorer](https://d20ioz705caon7.cloudfront.net/architecture) has five views covering the platform, delivery, networking, SQL recovery, and identity. The [diagram index](interactive/CURRENT-INDEX.md) links to their original sources and reading sheets.
