# ECS architecture diagrams

[Open Architecture Explorer](https://d20ioz705caon7.cloudfront.net/architecture) · [Read the architecture guide](../architecture.md)

| View | What it explains | Original source | Reading sheet |
| --- | --- | --- | --- |
| [ECS platform](ecs-platform.html) | Request flow from API Gateway to private ECS, KMS, SQL, and backup storage | [JSON](source/ecs-platform.json) | [HTML](readable/ecs-platform.html) |
| [API CI/CD Pipeline](ecs-delivery.html) | CI, image build, ECR digest, readiness, traffic switch, drain, and release records | [JSON](source/ecs-delivery.json) | [HTML](readable/ecs-delivery.html) |
| [Networking & NAT Recovery](ecs-network.html) | Two Availability Zones and independent NAT instance replacement | [JSON](source/ecs-network.json) | [HTML](readable/ecs-network.html) |
| [SQL Backups and Recovery](ecs-sql-recovery.html) | Verified backup copies, writer isolation, restoration, and application verification | [JSON](source/ecs-sql-recovery.json) | [HTML](readable/ecs-sql-recovery.html) |
| [Identity and TLS](ecs-trust.html) | Runtime, deployment, and administration boundaries and strict SQL trust | [JSON](source/ecs-trust.json) | [HTML](readable/ecs-trust.html) |

The interactive product uses verified English presentation copies. The JSON, official Archify HTML, and reading sheets above preserve the language and bytes of the originals. The reading sheets are project-generated derivatives with the original diagram SVG.

## Verify the originals locally

```sh
node --test scripts/diagrams/test-diagrams.mjs
```

The [generation manifest](GENERATION-CURRENT.json) pins the five sources, official HTML files, and reading sheets. The [traceability manifest](TRACEABILITY-CURRENT.json) binds them to implementation and evidence, and the [reproduction receipt](evidence/current/REPRODUCTION.json) records matching Archify 3.1.0 output. The Explorer renders architecture diagrams without querying live resources.

See the [Archify license](ARCHIFY-LICENSE.txt), [third-party notices](ARCHIFY-THIRD-PARTY-NOTICES.md), and [development guide](../development.md#verify-the-demo-and-diagrams).
