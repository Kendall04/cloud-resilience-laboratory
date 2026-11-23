# Local development and tests

Run commands from the repository root. The demo needs Node.js 20 or later. The API uses the exact .NET 10 SDK in [global.json](../global.json). Python 3 is used for the contract checks. Chrome and an existing Playwright installation are optional for browser tests.

## Text Demo

```sh
node portfolio/product/server.mjs
```

Open [Text Demo](http://127.0.0.1:4182/demo) or [Architecture Explorer](http://127.0.0.1:4182/architecture). The demo supports creating and reading synthetic messages, paging, and reset. Reloading resets the in-memory state. It needs neither an npm install nor access to AWS or SQL.

## Build and test the API

```sh
dotnet restore ./demo-api/terragrunt-demo.sln --locked-mode
dotnet build ./demo-api/terragrunt-demo.sln --configuration Release --no-restore
dotnet test ./demo-api/terragrunt-demo.sln --configuration Release --no-build
```

Restore can contact NuGet. The standard application tests use controlled doubles for external dependencies. Starting the server with real configuration is a separate integration task. See the [API contract](../terraform/docs/architecture.md#current-contract--application-and-data) and [application CI](../.github/workflows/ci-dotnet.yml).

## Verify the demo and diagrams

```sh
node --test portfolio/test-contract.mjs portfolio/test-archify.mjs scripts/diagrams/test-diagrams.mjs
python -I -B scripts/tests/final_acceptance/check_knowledge.py
```

These verify the demo contract, routing, build reproducibility, diagram integrity, and approved documentation dependencies. For the browser check, set `PLAYWRIGHT_MODULE` to the installed Playwright `index.mjs`, `CHROME_EXECUTABLE` to Chrome, and `UI_EVIDENCE_DIRECTORY` to a new empty output directory. Run `node portfolio/product/test-browser.mjs`. This runner uses loopback and controlled HTTP doubles. The [validation guide](../terraform/docs/validation.md) covers additional suites and command effects.

## Build the static package

Choose a new empty output directory:

```sh
node portfolio/product/build.mjs ./logs/portfolio-preview
node portfolio/product/preview.mjs ./logs/portfolio-preview
```

Open [the static preview](http://127.0.0.1:4183/demo). The manifest records each packaged file and its SHA-256. The build includes the two canonical routes and the five diagrams with their reading sheets. Hosting and release operations are documented separately.

## AWS Edition

AWS Edition uses a restricted loopback proxy for authorized sessions. It sends supported requests to an explicitly configured HTTPS API Gateway origin during an authorized window and surfaces upstream failures without synthetic fallback. See the [product guide](../portfolio/product/README.md) for the proxy's controls.
