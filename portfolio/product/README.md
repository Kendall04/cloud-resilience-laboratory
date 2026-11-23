# Text Demo and Architecture Explorer

[Text Demo](https://d20ioz705caon7.cloudfront.net/demo) · [Architecture Explorer](https://d20ioz705caon7.cloudfront.net/architecture) · [Local commands and tests](../../docs/development.md)

Text Demo stores synthetic messages in browser memory. Architecture Explorer shows the [five verified diagrams](../../docs/interactive/CURRENT-INDEX.md) with a responsive selector, keyboard controls, and reading sheets. The product uses HTML, CSS, and native JavaScript modules.

| Module | Responsibility |
| --- | --- |
| `app.mjs`, `style.css`, `index.html` | Workspace navigation, form states, layout, and keyboard interaction |
| `api.mjs` | Separate demo and AWS clients, byte limits, response shape, and UTC timestamps |
| `diagrams.mjs` and `archify-english.mjs` | Original hash verification and English presentation copies |
| `site-routes.mjs` | Canonical routes and compatibility redirects |
| `server.mjs` and `proxy.mjs` | Loopback server and opt-in, bounded client for an approved AWS endpoint |
| `build.mjs` and `preview.mjs` | Reproducible static package and verified local preview |

The deployed product opens `/demo` from the root. Legacy `/resilience` and `/evidence` URLs lead to relevant diagram context. Frames use `sandbox="allow-scripts"` without same-origin access and a network-blocking CSP. The parent verifies the event source and diagram node ID before showing citations.

## AWS Edition boundary

AWS Edition is a separate local process mode. To start it, set `ECS_AWS_ENDPOINT` to the explicitly approved HTTPS API Gateway origin and `ECS_AWS_AUTHORIZED_UNTIL` to the UTC deadline, then run `node portfolio/product/server.mjs --aws`. The default Text Demo requires neither setting. Use your own DEV environment and synthetic data.

A short-lived capability is kept in memory after its fragment is removed from the address bar. The proxy is restricted to loopback, a fixed upstream, and specific read and text operations. It checks the host and origin, bounds requests, and surfaces upstream failures without retries or synthetic fallback. The proxy capability controls this local tool. Access to the upstream API has the separate limits described in the [security guide](../../docs/security.md).

## Static hosting

The static build includes synthetic Text Demo and the Explorer. See [local packaging](../../docs/development.md#build-the-static-package) and the [hosting runbook](HOSTING.md) for release verification and rollback.
