# Demonstrated results

These results come from scoped DEV trials. Recovery times describe the observed events and do not establish a service-level guarantee.

| Capability | What was observed |
| --- | --- |
| Automatic DEV delivery | A merge triggered CI and a Docker build. The pipeline published an immutable ECR digest, deployed it on ECS, and verified the client response. |
| Blue/green rollback | A separate DEV exercise deployed a different image digest, restored the prior digest, verified SQL/KMS continuity, and observed the inactive tasks and targets drain. |
| Strict SQL TLS | A DEV release used the definitive server CA with hostname verification. The application established new SQL connections without the temporary leaf trust bridge. |
| Automatic NAT recovery | HTTPS egress returned in **2 min 29.191 s**, measured from the NAT A termination request to the first successful private-subnet probe through the same Elastic IP. |
| Same-AZ SQL recovery | **24 min 42.6 s** to fence the source, replace the SQL host in the same zone, restore, run integrity checks, and verify API/KMS access. |
| Cross-AZ SQL recovery | **41 min 31.5 s** to complete the supervised recovery and verification in another zone. |
| API, SQL, and KMS integration | A synthetic POST/GET round trip through the real API showed persistence and decryption through the SQL/KMS path. |

NAT replacement restores egress within its zone. SQL is single-writer and recovery uses verified full-backup restore points. The two SQL times include planned source isolation and cutover. DEV is the demonstrated environment.

For the design behind these results, see [delivery](delivery.md), [security](security.md), and [recovery](recovery.md). The five diagram originals and verification entry points are in the [diagram index](interactive/CURRENT-INDEX.md).
