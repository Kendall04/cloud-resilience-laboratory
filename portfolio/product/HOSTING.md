# Static hosting runbook

The [public demo](https://d20ioz705caon7.cloudfront.net/demo) and [Architecture Explorer](https://d20ioz705caon7.cloudfront.net/architecture) run independently of the application runtime. CloudFront serves an immutable release prefix in private, versioned S3 through a signed Origin Access Control (OAC). Two CloudFront Functions enforce the route allowlist and response headers.

The package contains the two workspaces and five diagrams. The shell Content Security Policy (CSP) blocks network connections. Diagram responses and the iframe add their own isolation. The production demo package contains no AWS proxy.

## Release verification

Build independently twice using the [local packaging instructions](../../docs/development.md#build-the-static-package). Compare the manifests and every file hash. The installed stack uses the pay-as-you-go template. Updating content requires an authorized account and a separately approved release.

The [content publisher](hosting/publish.py) validates the template and package, writes a new release prefix with create-only uploads, and verifies S3 checksums and object versions. Its update path accepts changes to the content route allowlist and release parameter. The existing distribution, origin access, bucket policy, and response-header configuration remain the comparison baseline.

For an authorized release, use a private receipt location and an explicitly reviewed template:

```sh
node portfolio/product/hosting/payg-template.mjs <new-template-directory>
python portfolio/product/hosting/publish.py update --profile <authorized-profile> \
  --account <approved-account-id> --operator-arn <exact-sts-caller-arn> \
  --stack <approved-stack> --bucket <approved-bucket> \
  --pricing-mode pay-as-you-go --template <template.json> \
  --template-sha256 <reviewed-sha256> --package <sealed-package> \
  --receipt <new-private-receipt.json>
```

Save the previous template, parameters, and release ID before applying an update. Wait for CloudFormation `UPDATE_COMPLETE` and CloudFront `Deployed`, then invalidate the existing distribution once. Use the publisher's read-only `verify` mode to check the installed configuration and each object version. Run:

```sh
node portfolio/product/test-public.mjs <cloudfront-origin> <sealed-package> <new-evidence-directory>
```

The HTTPS runner uses the Chrome and Playwright settings in the [development guide](../../docs/development.md#verify-the-demo-and-diagrams). It compares the public bytes and headers against the approved build and exercises both workspaces.

Rollback uses the same stack, the saved template, and the previous sealed release prefix. Wait for propagation, invalidate the cache, and verify HTTPS against that package. Prior prefixes and versions support rollback.
