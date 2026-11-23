import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDemo,
  createAws,
  parseText,
  utcTimestamp,
  validText,
} from "./api.mjs";
import { createProductServer } from "./server.mjs";
import { proxyHandler } from "./proxy.mjs";
const AWS_ENDPOINT = "https://example123.execute-api.us-east-1.amazonaws.com";
const AUTHORIZED_UNTIL = Date.parse("2026-11-09T04:00:00Z");
import { catalog, diagramAsset } from "./diagrams.mjs";
import { build, staticFiles } from "./build.mjs";
import { createPreview } from "./preview.mjs";
import "./hosting/test-hosting.mjs";
test("self-hosted Sora bytes match reviewed provenance", async () => {
  const provenance = JSON.parse(
    await readFile(new URL("fonts/PROVENANCE.json", import.meta.url), "utf8"),
  );
  assert.equal(provenance.networkAtRuntime, false);
  for (const file of provenance.files)
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL("fonts/" + file.path, import.meta.url)))
        .digest("hex"),
      file.sha256,
    );
  assert.match(
    await readFile(new URL("fonts/OFL.txt", import.meta.url), "utf8"),
    /SIL OPEN FONT LICENSE/,
  );
});
test("memory demo supports text/XSS literals, pagination and reset without fetch", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("DEMO network");
  };
  try {
    const api = createDemo();
    assert.equal(api.total, 2);
    assert.equal((await api.list()).length, 2);
    const row = await api.create("<img src=x onerror=alert(1)>");
    assert.equal(api.total, 3);
    assert.equal((await api.list(1, 1))[0].text, row.text);
    assert.equal((await api.list(2, 1))[0].id, 2);
    api.reset();
    assert.equal(api.total, 2);
    assert.equal((await api.list()).length, 2);
    assert.equal((await api.health()).live, "Simulated");
  } finally {
    globalThis.fetch = old;
  }
});
test("UTF8 API limit, schema and UTC timestamp contract", () => {
  assert.throws(() => validText(" "));
  assert.throws(() => validText("🔒".repeat(1025)));
  assert.equal(validText("🔒".repeat(1024)).length, 2048);
  assert.throws(() =>
    parseText({ id: 0, text: "bad", createdAt: "2026-11-07T01:10:08" }),
  );
  assert.equal(
    parseText({ id: 6, text: "x", createdAt: "2026-11-07T01:10:08.7073381" })
      .createdAt,
    "2026-11-07T01:10:08.7073381Z",
  );
  assert.equal(utcTimestamp("2026-11-07T01:10:08Z"), "2026-11-07T01:10:08Z");
  assert.throws(() => utcTimestamp("yesterday"));
});
test("AWS client never retries writes or falls back on HTTP/timeout/malformed response", async () => {
  let count = 0;
  const fail = createAws("token", async () => {
    count++;
    return new Response("{}", { status: 503 });
  });
  await assert.rejects(fail.create("synthetic"), /HTTP 503/);
  assert.equal(count, 1);
  await assert.rejects(createAws("").list(), /locked/);
  await assert.rejects(
    createAws("t", async () => new Response("{}", { status: 200 })).list(),
    /Invalid page response/,
  );
  const hang = createAws(
    "t",
    (_u, o) =>
      new Promise((_, reject) =>
        o.signal.addEventListener("abort", () =>
          reject(new DOMException("test", "AbortError")),
        ),
      ),
    5,
  );
  await assert.rejects(hang.list(), /timed out/);
});
async function withServer(options, body) {
  const s = createProductServer({
    ...options,
    now: () => Date.parse("2026-11-07T01:00:00Z"),
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${s.address().port}`;
  try {
    await body(origin, s);
  } finally {
    await new Promise((r) => s.close(r));
  }
}
function request(origin, route, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(origin);
    const r = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: route,
        method,
        headers,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (x) => chunks.push(x));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    r.on("error", (e) => {
      e.message = `${method} ${route}: ${e.message}`;
      reject(e);
    });
    r.end(body);
  });
}
test("DEMO server has no API/proxy, blocks traversal and sensitive files, CSP no connect", async () =>
  withServer({}, async (origin) => {
    const r = await request(origin, "/demo");
    assert.equal((await request(origin, "/demo/")).status, 200);
    assert.equal(r.status, 200);
    assert.match(r.headers["content-security-policy"], /connect-src 'none'/);
    assert.equal(
      (await request(origin, "/assets/config.mjs")).text,
      'export const edition="demo";',
    );
    for (const p of [
      "/_api/text?page=1&pageSize=5",
      "/.aws/credentials",
      "/server.mjs",
      "/sources/unknown.json",
      "/../.git/config",
    ])
      assert.equal((await request(origin, p)).status, 404, p);
    for (const p of [
      "//example.org/",
      "http://example.org/",
      "/%2e%2e/.git/config",
    ])
      assert.equal((await request(origin, p)).status, 400);
    assert.equal(
      (await request(origin, "/demo", { headers: { Host: "evil.example" } }))
        .status,
      400,
    );
    assert.equal(
      (await request(origin, "/demo", { method: "POST" })).status,
      405,
    );
    assert.equal((await request(origin, "/demo", { method: "HEAD" })).text, "");
  }));
test("proxy authorizes local capability, exact origin/routes/body and bounded requests", async () => {
  const token = randomBytes(32).toString("hex"),
    seen = [];
  await withServer(
    {
      mode: "aws",
      endpoint: AWS_ENDPOINT,
      authorizedUntil: AUTHORIZED_UNTIL,
      token,
      fetcher: async (url, options) => {
        seen.push({ url, options });
        return new Response(
          JSON.stringify({
            id: 1,
            text: "test",
            createdAt: "2026-11-07T00:00:00Z",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
    async (origin) => {
      const headers = {
        "X-ECS-Session": token,
        Origin: origin,
        "Content-Type": "application/json",
      };
      assert.equal((await request(origin, "/_api/ready")).status, 403);
      assert.equal(
        (
          await request(origin, "/_api/ready", {
            headers: { ...headers, Origin: "https://evil.example" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(origin, "/_api/ready", {
            headers: { ...headers, "Sec-Fetch-Site": "cross-site" },
          })
        ).status,
        403,
      );
      assert.equal(
        (await request(origin, "/_api/text?page=1&pageSize=100", { headers }))
          .status,
        400,
      );
      assert.equal(
        (
          await request(origin, "/_api/text?page=1&page=2&pageSize=5", {
            headers,
          })
        ).status,
        400,
      );
      assert.equal(
        (await request(origin, "/_api/http://example.org", { headers })).status,
        404,
      );
      assert.equal(
        (
          await request(origin, "/_api/text", {
            headers,
            method: "POST",
            body: '{"text":"test","url":"https://evil.example"}',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(origin, "/_api/text", {
            headers: {
              "X-ECS-Session": token,
              "Content-Type": "application/json",
            },
            method: "POST",
            body: "{}",
          })
        ).status,
        403,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await request(origin, "/_api/text", {
              headers,
              method: "POST",
              body: '{"text":"test"}',
            })
          ).status,
          200,
        );
      assert.equal(
        (
          await request(origin, "/_api/text", {
            headers,
            method: "POST",
            body: '{"text":"test"}',
          })
        ).status,
        429,
      );
      assert.equal(seen.length, 2);
      for (const r of seen) {
        assert.equal(r.url, AWS_ENDPOINT + "/text");
        assert.equal(r.options.redirect, "error");
        assert(!("X-ECS-Session" in r.options.headers));
      }
    },
  );
});
test("AWS mode fails closed without an approved HTTPS origin and future window", () => {
  const opts = {
    mode: "aws",
    token: "a".repeat(64),
    now: () => Date.parse("2026-11-07T01:00:00Z"),
    endpoint: AWS_ENDPOINT,
    authorizedUntil: AUTHORIZED_UNTIL,
  };
  for (const endpoint of [undefined, "http://example123.execute-api.us-east-1.amazonaws.com",
    AWS_ENDPOINT + "/text", AWS_ENDPOINT + "?redirect=localhost",
    "https://example123.execute-api.us-east-1.amazonaws.com@localhost"]) {
    assert.throws(() => createProductServer({ ...opts, endpoint }), /HTTPS API Gateway origin/);
  }
  for (const authorizedUntil of [undefined, NaN, opts.now(), opts.now() - 1])
    assert.throws(() => createProductServer({ ...opts, authorizedUntil }), /window|deadline/);
});

test("expired proxy and closure fail before external dispatch", async () => {
  let calls = 0;
  const handler = proxyHandler({
    token: "a".repeat(64),
    endpoint: AWS_ENDPOINT,
    expires: AUTHORIZED_UNTIL,
    now: () => AUTHORIZED_UNTIL,
    fetcher: () => calls++,
  });
  let code;
  await handler(
    { headers: { "x-ecs-session": "a".repeat(64) } },
    { writeHead: (n) => (code = n), end: () => {} },
    new URL("http://127.0.0.1/_api/ready"),
    "http://127.0.0.1",
  );
  assert.equal(code, 403);
  assert.equal(calls, 0);
});

test("concurrent POST bodies cannot exceed the session write ceiling", async () => {
  const token = randomBytes(32).toString("hex");
  let calls = 0;
  await withServer(
    {
      mode: "aws",
      endpoint: AWS_ENDPOINT,
      authorizedUntil: AUTHORIZED_UNTIL,
      token,
      fetcher: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 15));
        return new Response("{}", {
          headers: { "content-type": "application/json" },
        });
      },
    },
    async (origin) => {
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(origin, "/_api/text", {
            method: "POST",
            headers: {
              "X-ECS-Session": token,
              Origin: origin,
              "Content-Type": "application/json",
            },
            body: '{"text":"synthetic"}',
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 429]);
      assert.equal(calls, 2);
    },
  );
});

test("upstream non-JSON errors preserve HTTP status but never disclose diagnostics", async () => {
  const token = randomBytes(32).toString("hex");
  await withServer(
    {
      mode: "aws",
      endpoint: AWS_ENDPOINT,
      authorizedUntil: AUTHORIZED_UNTIL,
      token,
      fetcher: async () =>
        new Response("upstream diagnostic marker", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        }),
    },
    async (origin) => {
      const result = await request(origin, "/_api/ready", {
        headers: { "X-ECS-Session": token },
      });
      assert.equal(result.status, 400);
      assert.doesNotMatch(result.text, /diagnostic marker/);
      assert.match(result.headers["content-type"], /application\/json/);
    },
  );
});
test("five current diagrams only, source pins and opaque isolated derivatives", async () => {
  const all = await catalog();
  assert.equal(all.filter((x) => !x.historical).length, 5);
  assert.equal(all.filter((x) => x.historical).length, 0);
  assert.equal(all.filter((x) => x.reading).length, 5);
  assert.equal(all.length, 5);
  const delivery = all.find(({ id }) => id === "ecs-delivery");
  assert.equal(delivery.label, "API CI/CD Pipeline");
  assert.equal(delivery.title, "From Merge to DEV Deployment");
  const network = all.find(({ id }) => id === "ecs-network");
  assert.equal(network.label, "Networking & NAT Recovery");
  assert(network.nodes.some(({ name }) => name === "NAT Instance Recovery"));
  for (const kind of ["diagrams", "reading"]) {
    const asset = await diagramAsset(`/${kind}/ecs-network.html`);
    assert.match(asset.body, /NAT Instance Recovery/);
    assert.doesNotMatch(asset.body, /\bE13\b/);
  }
  for (const id of ["v1-platform", "v1-network", "az6-recovery", "backup-signals", "future-integrations", "v2-platform", "v2-sentinel", "v2-nat-incident", "v2-sql-recovery", "v2-network", "v2-trust", "v2-delivery"]) {
    for (const prefix of ["/diagrams/", "/reading/", "/sources/"])
      assert.equal(await diagramAsset(prefix + id + (prefix === "/sources/" ? ".json" : ".html")), null);
  }
  for (const d of all) {
    assert(d.nodes.length);
    assert(
      d.nodes.every((n) =>
        n.sources.every((s) =>
          s.url.startsWith(
            "https://github.com/Kendall04/cloud-resilience-laboratory/blob/main/",
          ),
        ),
      ),
    );
    const a = await diagramAsset("/diagrams/" + d.id + ".html");
    assert.match(a.policy, /connect-src 'none'/);
    assert.match(a.body, /data-present="true"/);
    assert.doesNotMatch(a.body, /<a[^>]*href=|<script[^>]*src=/);
    assert((await diagramAsset("/sources/" + d.id + ".json")).body.length);
    if (d.reading)
      assert((await diagramAsset("/reading/" + d.id + ".html")).body.length);
  }
  assert.equal(await diagramAsset("/diagrams/unknown.html"), null);
});
test("static DEMO package is reproducible, separate from runtime proxy and AWS credentials", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ecs-product-test-"));
  try {
    const a = await build(path.join(dir, "a")),
      b = await build(path.join(dir, "b"));
    assert.deepEqual(a, b);
    const expected = JSON.parse(
      await readFile(
        new URL("static-build-manifest.json", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(a, expected, "Current static build must match its manifest");

    // Browser evidence describes the exact package used in that dated run.
    const reviewed = JSON.parse(
      await readFile(
        new URL("evidence/STATIC-MANIFEST.json", import.meta.url),
        "utf8",
      ),
    );
    const qa = JSON.parse(
      await readFile(
        new URL("evidence/BROWSER-QA.json", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(qa.staticManifest, reviewed, "Browser evidence manifest");
    assert.equal(
      createHash("sha256").update(JSON.stringify(reviewed.files)).digest("hex"),
      reviewed.contentSHA256,
      "Browser evidence manifest digest",
    );
    for (const capture of qa.captures) {
      assert.equal(
        createHash("sha256")
          .update(
            await readFile(
              new URL("evidence/" + capture.file, import.meta.url),
            ),
          )
          .digest("hex"),
        capture.sha256,
        capture.file,
      );
    }
    assert.equal(a.edition, "demo");
    const files = await staticFiles();
    assert.equal(
      files.get("assets/config.mjs").toString(),
      'export const edition="demo";',
    );
    assert(
      ![...files.keys()].some((p) =>
        /server|proxy|test-|private|\.env/.test(p),
      ),
    );
    assert(
      ![...files.values()].some((b) =>
        /AKIA[0-9A-Z]{16}|BEGIN (?:RSA )?PRIVATE KEY/.test(b.toString()),
      ),
    );
    assert.match(files.get("index.html").toString(), /connect-src 'none'/);
    await assert.rejects(build(path.join(dir, "a")), /empty/);
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("UI keeps mode explicit, uses textContent for user text, isolated frames and historical limitations", async () => {
  const app = await readFile(new URL("app.mjs", import.meta.url), "utf8");
  const data = await readFile(new URL("data.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(app, /innerHTML|localStorage|sessionStorage/);
  assert.match(app, /sandbox:\s*["']allow-scripts["']/);
  assert.doesNotMatch(app, /allow-same-origin/);
  assert.match(app, /e.source\s*!==\s*frame.contentWindow/);
  assert.match(app, /e.origin\s*!==\s*["']null["']/);
  assert.match(data, /ASG\/E13 recupera/);
  assert.match(data, /no.*RPO cero/);
});

test("built package previews exact routes, refuses API and detects changed bytes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ecs-static-test-"));
  let server;
  try {
    await build(dir);
    server = await createPreview(dir);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const p of ["/demo", "/demo/", "/architecture?diagram=ecs-trust", "/architecture/"])
      assert.equal((await request(origin, p)).status, 200);
    for (const [source, destination] of [
      ["/", "/demo"],
      ["/resilience/", "/architecture?diagram=ecs-network#context"],
      ["/resilience?scenario=sql", "/architecture?diagram=ecs-sql-recovery#context"],
      ["/resilience?scenario=backup", "/architecture?diagram=ecs-sql-recovery#context"],
      ["/resilience?scenario=constructor", "/architecture?diagram=ecs-network#context"],
      ["/evidence", "/architecture?diagram=ecs-delivery#context"],
    ]) {
      const response = await request(origin, source);
      assert.equal(response.status, 308, source);
      assert.equal(response.headers.location, destination);
    }
    for (const p of ["/_api/ready", "/proxy.mjs", "/unknown", "/resilience/index.html", "/evidence/index.html"])
      assert.equal((await request(origin, p)).status, 404);
    assert.match(
      (await request(origin, "/diagrams/ecs-trust.html")).headers[
        "content-security-policy"
      ],
      /connect-src 'none'/,
    );
    await writeFile(
      path.join(dir, "assets/config.mjs"),
      'export const edition="aws";',
    );
    assert.equal((await request(origin, "/assets/config.mjs")).status, 503);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true });
  }
});
