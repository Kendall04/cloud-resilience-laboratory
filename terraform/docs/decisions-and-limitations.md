# Architectural decisions and constraints

These constraints guide changes to the [architecture](../../docs/architecture.md), [delivery](../../docs/delivery.md), and [recovery](../../docs/recovery.md).

| Decision | Implication |
| --- | --- |
| Cost awareness and a single operator | Prefer independent components, bounded automation, and recovery procedures one operator can supervise. |
| Secret values outside Terraform | Terraform owns metadata and access policy. Authorized operations manage secret values separately. |
| SQL Server Express on EC2 | Keep the single-writer design and test recovery through verified backups and a new host. |
| Explicit owners for changes | Terraform owns infrastructure definitions. Delivery owns runtime revisions, counts, and ALB forwarding. NAT handlers own route repair. |
| Separate deployable application and public demo | The static demo uses in-memory synthetic data. The lab API also uses synthetic data because its text endpoints are unauthenticated. |
| Qualify environment boundaries before use | DEV delivery and recovery have observed evidence. PROD requires its own configuration, credentials, trust, and AWS qualification. The implemented ECR repository is shared. |

Operation relies on approved source and effective grants. Use the [operator guide](bootstrap.md) before a live change and [results](../../docs/RESULTS.md) when citing a demonstrated outcome.
