# Publication provenance

This code was selected from the completed lab at source revision
9dcbbe7d8c053759e93ba41cb04e1779f1389d4f. The Git history of that workspace
is private. Historical commit identifiers in evidence identify original inputs.

- [Demonstrated results](RESULTS.md) describes historical DEV experiments.
- [Diagram index](interactive/CURRENT-INDEX.md) identifies authenticated Archify originals. Explorer code links resolve to corresponding files in this repository.
- The historical browser receipts and captured images record earlier UI packages. The current build manifest describes this snapshot separately.
- The source inventory is a new admission record for the reviewed public tree. Its private predecessor was retained with the original project.
- Raw AWS API, hosting and recovery readbacks that exposed account-linked routing, object versions, captured rows or local filesystem paths were omitted. The original receipts remain in the private history.

See the [development guide](development.md) for tests that can be repeated without a live AWS lab.

## Historical fixture derivatives

The retired DEV and PROD fixtures below use an example alert address in this
publication. Only the alert address changed. The original files and their
original acceptance catalogs remain in the private history. The public
retirement and legacy-source catalogs verify the bytes of these two derivatives.

| Public fixture | Original SHA-256 (LF) | Public SHA-256 (LF) |
| --- | --- | --- |
| `ci/authority/retired/terraform/live/dev/root.hcl.txt` | `ce3aa5be9377d416e02bbdebb340d320ea2881913bc91d91188986f9aa3b4410` | `1d86c2c59db4e54bbed8fa1ac3fd84719828ec9204a57cc6ab08715d955eb889` |
| `ci/authority/retired/terraform/live/prod/root.hcl.txt` | `e6599e5e8aa79baa71f19fbe04e312f23155e96c676b8284b1dd99ab4a127227` | `a338f94900988a44bebc9cf1de1254651a3ba882d65c180fb0bb5e137bef8c74` |

The aggregate legacy-source catalog changed from SHA-256 `dfdbe2987310cbc8982c821f80d82bcf959ab517d9097e7420c8aaf5324f5019` to
`e482209999514d81002df2c3aa3892b5b8d9edd8db43126ea9781a9e7f08c025`. The public admission check pins the new catalog exactly.

## Offline baseline fixtures

The native-backend check compares current Terraform expressions against
the [two extracted historical expressions](../scripts/tests/native_ecs/fixtures/backend-policy-baseline.json).
The extracted-package check compares package digests against
[historical bundle digests](../scripts/tests/internal_release/fixtures/package-baseline.json).
Each fixture records its source revision, path, full source hash and selector.
The original operands were extracted unchanged. The tests pin the fixture bytes
and keep their original comparisons. These fixtures let a one-commit clone
run the checks without importing the source Git history.
