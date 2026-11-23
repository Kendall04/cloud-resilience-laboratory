# NAT instance recovery runbook

The [recovery guide](../../docs/recovery.md#automatic-nat-recovery) explains the per-zone replacement mechanism. This runbook covers installation, failure diagnosis, and the evidence an operator needs before declaring egress restored.

## Current DEV installation and version transition

Keep `dev_nat_inhibited=true` and `dev_delivery_inhibited=true` during installation. NAT inhibition stops the three handlers and the launch rule. The delivery gateway and cleanup use an independent hold. Releasing NAT must leave those application writers inhibited.

Prepare protected launch bindings for the exact environment, VPC, subnet, Availability Zone, instance profile, security group, launch-template ID and numeric version, EIP, and route table. Read back the three published numeric Lambda versions, exact bundle versions, rule targets, qualified permissions, retry and destination settings, and role bindings. A qualifier change replaces its invoke permissions and async configuration. Reconcile accepted old-version work before removing those bindings. Inhibition alone does not cancel queued work. Preserve failure queues and avoid mutable aliases or unqualified admission.

Review the inhibited security installation first, then the separate Global NAT plan. A separately authorized activation changes only the approved inhibition values before the reviewed ASG launch. For a stopped or uncertain installation, keep the holds in place and use current owner state and exact package identities to review a correction. An old version bound to a different network cannot serve as rollback. See [native lifecycle](native-dev-lifecycle.md).

## Event handling and failure triage

The [controller configuration](../infra/security/modules/controller_compute/main.tf.json) accepts successful EC2 launches from the exact account, region, and approved Auto Scaling groups. It invokes independently scoped versions of the EIP, route, and source/destination-check handlers. The event instance must match the independently resolved current group member. Each duty derives a stable operation identity from the event.

| Failure boundary | Policy |
| --- | --- |
| EventBridge delivery | At most three retries and 900 seconds of event age. Undeliverable events go to the delivery failure queue. |
| Accepted Lambda invocation | At most one function-error retry and 900 seconds of async event age. Failed executions go to a separate destination. |
| Failed failure-destination delivery | Use CloudWatch signals to investigate. A metric alone cannot establish that the payload was retained. |

The queues are environment-scoped, encrypted, and retain messages for 14 days. They have no automatic consumer or redrive. Correlate the event, numeric handler version, operation ID, and action journal. An unresolved attempt can have taken effect. Read the actual membership and mutation result before considering any retry. Keep raw console output, credentials, and private payloads out of shared evidence.

## Forwarding evidence

1. Verify the current instance is healthy and in service, and matches the approved launch and network membership.
2. Read back EIP association, the active private default route to its network interface, and source/destination checking disabled.
3. Check the fixed bootstrap marker for the exact instance after launch. The bootstrap verifies IP forwarding, the NAT rule, the service, and the interface default route before emitting `E13_NAT_BOOTSTRAP_V1`. Missing or malformed evidence fails closed.
4. Observe HTTPS from an approved workload using the exact private subnet route. Bind the observation to the current instance, route, and expected EIP. The result remains `UNVERIFIED_LIVE_PROOF_REQUIRED` until this traffic is observed.

The [readiness checker](../../scripts/nat/reliability.py) runs after the source/destination-check duty and observes the other duties' effects without assuming their order. It performs bounded readbacks. A successful mutation, a boot marker, or an Internet request from the NAT host has a narrower scope than private-subnet egress. Use [results](../../docs/RESULTS.md) for the measured DEV trial.

## Maintainer and administrator boundaries

The administrator selects an exact reviewed AMI and newer numeric launch version. Keep identity, fixed bootstrap, network, profile, security groups, and remaining launch controls within the approved binding. Plan an outage for one zone at a time. Verify the old/candidate hashes and source identity through the separate approval path, and reconcile the launch binding with the Global owner. The recovery handlers cannot patch templates or terminate instances.

The replacement validator checks a scoped approval projection. The repository has no live port or automatic patch executor for that validator. Real rollout requires independent readback, all three action results, and verified private-subnet HTTPS. Confirm failure containment and notification delivery separately before proceeding to the other zone. Only an exact previous configuration qualified on the same network is a rollback candidate.

```sh
python -I -B scripts/tests/nat/run.py
```

The checks are offline. See [validation effects](validation.md) and the [operational guide](bootstrap.md) before reaching AWS.
