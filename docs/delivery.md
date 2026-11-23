# API CI/CD Pipeline

The CI/CD pipeline validates changes, builds immutable container images, and deploys approved releases to ECS using blue/green traffic switching. Automatic DEV delivery was demonstrated in AWS.

## CI and change selection

The [CI workflow](../.github/workflows/ci.yml) selects checks from the full Git event change set. Application changes can select locked .NET builds and tests. Infrastructure, repository, and security-sensitive changes select their own validation. Incomplete history selects checks conservatively. [Delivery safety checks](../.github/workflows/ci-cd-safety.yml) exercise release and infrastructure guards independently.

For delivery, the [scope selector](../scripts/api_delivery/cli.py) compares the application identity before and after the push. A documentation-only change skips application delivery before credentials or image publication. The release workflow requires CI and delivery safety results for the exact integrated commit.

## From merge to DEV deployment

1. **Authorize.** GitHub OpenID Connect (OIDC) obtains short-lived AWS credentials for the delivery role. The environment queue serializes operations with separate configuration per environment.
2. **Build once.** Build the API image from the selected commit and publish it to Amazon Elastic Container Registry (ECR). Identify the image by its immutable digest.
3. **Start the inactive color.** Register the approved image and configuration, including the exact secret version. Start the candidate tasks and verify task identity, SQL and KMS readiness, and ALB target health.
4. **Shift traffic.** Switch ALB forwarding to the healthy candidate and verify the client route. Keep the previous tasks during a verification and drain interval. Recheck readiness and routing before stopping them.
5. **Record the release.** Write a versioned, encrypted S3 release record and index it in GitHub Deployments. The record binds source identity, image digest, task revision, configuration, and outcome.

See the [delivery workflow](../.github/workflows/api-delivery.yml), [reusable executor](../.github/workflows/api-execute.yml), and [blue/green sequence](../scripts/api_delivery/executor.py). Infrastructure state and application delivery have [separate owners](architecture.md#infrastructure-and-release-ownership).

The executor rechecks the exact candidate task cohort before changing the listener. A missing readiness result or a replaced task stops promotion and leaves traffic with the active color. ECS observation and an ALB listener change are separate operations, so the final identity check bounds the observation-to-switch gap.

## Rollback and reconciliation

Rollback deploys the previous compatible image through the same blue/green path with approved configuration and fresh readiness checks. Image rollback leaves database schema changes in place. A failure before draining can return traffic to still-healthy previous tasks. Once draining starts, the executor preserves the healthy candidate and reconciles the actual routes and task state before admitting another release.

Reconciliation validates routing, revisions, task counts, and client readiness. A failed publication can be repaired from the verified record without rebuilding or redeploying. See the [operator runbook](../terraform/docs/deployment.md) for the operational boundary and [results](RESULTS.md) for the scope of the AWS evidence.

## PROD promotion

The [promotion evaluator](../.github/workflows/api-promotion.yml) selects a specific successful DEV release for the proposed application content. The PROD path verifies its versioned manifest and exact ECR digest and reuses that image with its environment configuration. It uses the same executor without rebuilding the image. Qualified PROD infrastructure, credentials, and trust remain prerequisites. The implemented registry model uses a shared ECR repository. PROD was never deployed or validated in AWS.
