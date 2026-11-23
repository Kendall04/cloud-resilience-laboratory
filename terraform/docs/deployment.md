# Application release operations

The [API CI/CD guide](../../docs/delivery.md) describes the release sequence and demonstrated scope. This runbook covers admission and recovery for an authorized installation.

## Admission and configuration

- Confirm the environment, protected branch, exact source checks, and independent activation flag. Verify the approved binding and handover references. The DEV and PROD workflow contexts use different configuration.
- Preserve GitHub environment serialization and exclude competing writers. Terraform leaves task revisions, service counts, and ALB forwarding to the application executor. A versioned `api-delivery/<env>/state.json` detects conflicting writes with `If-Match`. It is an operation record, not a lease.
- The handover binds the previous ownership head and recorded settled effects. Existing legacy records and unresolved evidence stay intact. Use [the legacy diagnostic](../../scripts/owner_recovery.py) for interpretation. A timeout or missing observation is insufficient to release ownership or fabricate a terminal record.
- Verify the active image, revision, exact connection-secret version, SQL trust, and client readiness. Database schema changes require their own procedure.

The relevant environment fields are `API_ACCOUNT_ID`, `API_REGION`, `API_DELIVERY_ROLE_ARN`, `API_BINDING_REF`, and `API_HANDOVER_REF`. The OIDC trust includes the intended environment and reusable workflow reference. See [delivery permissions](../../scripts/api_delivery/permissions.py), [secret lifecycle](secrets-strategy.md), and [infrastructure security and validation](e1-final-acceptance.md).

## Failure, rollback, and reconciliation

| Observation | Appropriate action |
| --- | --- |
| Healthy release and failed publication | Reconcile the observed release and republish the verified record. A new release waits for the previous operation to settle. |
| Old color still serves and a candidate remains | Inspect both forwarding rules, task revisions, and the operation record. Stop only a positively identified inactive candidate under supervised maintenance. |
| New color serves after drain and the final record is missing | Reconcile the exact candidate revision, configuration, healthy task cohort, routes, and SQL/KMS response. |
| Unknown route, foreign revision, or unsettled capacity | Keep activation off. Inspect and reconcile under an approved maintenance window. |
| Request to roll back a complete release | Use the recorded compatible previous digest with verified current configuration. Validate the candidate before shifting routes. Handle schema changes separately. |

The workflow provides `reconcile` and `rollback` operations on the corresponding protected branch. For a separately authorized DEV session:

```sh
gh workflow run api-delivery.yml --ref develop -f environment=dev -f operation=reconcile
gh workflow run api-delivery.yml --ref develop -f environment=dev -f operation=rollback
```

Select only the applicable operation. Recheck the actual routes and tasks before any retry. These commands require an enabled, qualified environment and can affect AWS. For offline checks, use [validation](validation.md).
