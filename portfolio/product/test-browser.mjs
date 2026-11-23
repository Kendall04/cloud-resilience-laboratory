// Isolated Chrome, DEMO + explicit HTTP doubles. Never dispatches to AWS.
import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProductServer } from "./server.mjs";
import { catalog } from "./diagrams.mjs";
import { build } from "./build.mjs";
import { createPreview } from "./preview.mjs";
const destination = process.env.UI_EVIDENCE_DIRECTORY;
assert(
  destination && process.env.PLAYWRIGHT_MODULE && process.env.CHROME_EXECUTABLE,
  "Explicit existing Chrome/Playwright and new evidence directory required",
);
await mkdir(destination, { recursive: true });
assert.equal((await readdir(destination)).length, 0, "Preserve prior evidence");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const servers = [],
  receipt = {
    kind: "DEMO_AND_HTTP_DOUBLES_NOT_AWS",
    at: new Date().toISOString(),
    checks: [],
    captures: [],
    externalRequests: [],
    browserErrors: [],
  };
async function serve(options) {
  const s = createProductServer(options);
  servers.push(s);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${s.address().port}`;
}
const demo = await serve({});
const spanishCopy = /[áéíóúñ¿¡]|\b(?:mensaje|mensajes|diagrama|guardar|escribe|borrar|fuentes|recuperados|buscar|reiniciar|acercar|alejar|leyenda|ajustar)\b/i;
async function assertEnglish(view) {
  const surface = await view.evaluate(() => ({
    lang: document.documentElement.lang,
    copy: document.body.innerText + "\n" + [...document.querySelectorAll("[aria-label], [placeholder], [title]")]
      .flatMap((node) => ["aria-label", "placeholder", "title"].map((name) => node.getAttribute(name) ?? ""))
      .join("\n"),
  }));
  assert.equal(surface.lang, "en");
  const leftover = surface.copy.match(spanishCopy);
  assert(!leftover, leftover && `Untranslated copy: ${leftover[0]}`);
}
let browser;
function pass(s) {
  receipt.checks.push(s);
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator("#diagram-frame").count()) {
    const f = await (
      await page.locator("#diagram-frame").elementHandle()
    ).contentFrame();
    await f.waitForURL(
      "**" + (await page.locator("#diagram-frame").getAttribute("src")),
    );
    await f.locator("svg [data-node-id]").first().waitFor();
    if (!(await page.locator("#diagram-frame").getAttribute("src")).startsWith("/reading/"))
      await f.locator(".diagram-nav [data-view=reset]").click();
  }
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  const bytes = await page.screenshot({
    path: path.join(destination, name + ".png"),
    fullPage: true,
  });
  receipt.captures.push({
    file: name + ".png",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
async function navigate(page, route) {
  await page.locator(`#space-nav a[href="${route}"]`).click();
}
async function selectDiagram(page, id) {
  const selector = page.locator("#diagram-select");
  if (await selector.isVisible()) await selector.selectOption(id);
  else await page.locator(`#diagram-nav a[href="/architecture?diagram=${id}"]`).click();
}
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await context.route("**/*", (r) => {
    if (new URL(r.request().url()).origin !== demo) {
      receipt.externalRequests.push(r.request().url());
      return r.abort();
    }
    return r.continue();
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => receipt.browserErrors.push(e.message));
  let apiCalls = 0;
  p.on("request", (r) => {
    if (r.url().includes("/_api/")) apiCalls++;
  });
  await p.goto(demo + "/demo");
  await p.locator(".message-row").first().waitFor();
  await assertEnglish(p);
  await p.keyboard.press("Tab");
  assert(
    await p.locator(".skip").evaluate((n) => n === document.activeElement),
  );
  await p.keyboard.press("Enter");
  assert(await p.locator("main").evaluate((n) => n === document.activeElement));
  pass("Keyboard skip link");
  await p.locator("#send").click();
  await p.getByRole("alert").filter({ hasText: "Enter a message." }).waitFor();
  assert.equal(await p.locator(".message-row").count(), 2);
  const xss = "<img src=x onerror=window.injected=true> · synthetic text";
  await p.locator("#message").fill(xss);
  await p.locator("#send").click();
  await p.locator('.message-row[data-id="3"]').filter({ hasText: xss }).waitFor();
  assert.equal(await p.locator(".message-row img").count(), 0);
  assert.equal(await p.evaluate(() => window.injected), undefined);
  await p.locator("#reset").click();
  assert.equal(await p.locator(".message-row").count(), 2);
  pass("DEMO create/read/reset and literal XSS");
  const previous = p.getByRole("button", { name: "← Previous", exact: true });
  const next = p.getByRole("button", { name: "Next →", exact: true });
  const pageLabel = p.locator("#page-label");
  assert(await previous.isDisabled());
  assert(await next.isDisabled());
  for (let i = 0; i < 4; i++) {
    await p.locator("#message").fill("Synthetic page boundary " + i);
    await p.locator("#send").click();
    await p.locator(".message-row").first().filter({ hasText: "Synthetic page boundary " + i }).waitFor();
  }
  assert.equal(await pageLabel.textContent(), "Page 1 of 2");
  assert(await previous.isDisabled());
  await next.click();
  await p.locator('.message-row[data-id="1"]').waitFor();
  assert.equal(await pageLabel.textContent(), "Page 2 of 2");
  assert.equal(await p.locator(".message-row").count(), 1);
  assert(await next.isDisabled());
  await p.locator("#refresh").click();
  assert.equal(await pageLabel.textContent(), "Page 2 of 2");
  await previous.click();
  assert.equal(await pageLabel.textContent(), "Page 1 of 2");
  await next.click();
  await p.locator("#reset").click();
  assert.equal(await pageLabel.textContent(), "Page 1 of 1");
  assert(await previous.isDisabled());
  assert(await next.isDisabled());
  pass("DEMO paging tracks available records across create, refresh and reset");
  await capture(p, "desktop-product");
  assert.equal(await p.locator("#space-nav a").count(), 2);
  assert.equal((await p.locator("#workspace-context").innerText()).trim().replace(/\s+/g, " "), "Workspace / Messages");
  for (const [path, diagram, evidence] of [
    ["/resilience?scenario=nat", "ecs-network", "2m 29.191s"],
    ["/resilience?scenario=sql", "ecs-sql-recovery", "41m 31.5s"],
    ["/evidence", "ecs-delivery", "ECR"],
  ]) {
    await p.goto(demo + path);
    assert.equal(new URL(p.url()).searchParams.get("diagram"), diagram);
    assert.equal(new URL(p.url()).hash, "#context");
    assert((await p.locator("#context").innerText()).includes(evidence));
    assert(await p.locator("#context").evaluate(node => node === document.activeElement));
  }
  pass("Legacy routes keep dated NAT/SQL/CD evidence inside the corresponding diagrams");
  await navigate(p, "/architecture");
  await p.getByRole("button", {name: "Expand view", exact: true}).click();
  assert.equal(await p.locator(".diagram-stage.expanded").count(), 1);
  await p.keyboard.press("Escape");
  assert.equal(await p.locator(".diagram-stage.expanded").count(), 0);
  assert(await p.getByRole("button", {name: "Expand view", exact: true}).evaluate(node => node === document.activeElement));
  const diagrams = await catalog();
  assert.equal(diagrams.length, 5);
  for (const width of [1920, 768, 320, 1440, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    for (const d of diagrams) {
      await selectDiagram(p, d.id);
      const f = await (
        await p.locator("#diagram-frame").elementHandle()
      ).contentFrame();
      await f.waitForURL("**/diagrams/" + d.id + ".html");
      await f.locator("svg [data-node-id]").first().waitFor();
      if (width === 1440) { await assertEnglish(p); await assertEnglish(f); }
      await f.locator(".diagram-nav [data-view=reset]").click();
      assert((await f.locator("svg [data-node-id]").count()) > 0);
      assert(
        await f.evaluate(() => {
          try {
            parent.document.body;
            return false;
          } catch {
            return true;
          }
        }),
      );
      const node = f.locator("svg [data-node-id]").first();
      const before = await node.evaluate(
        (n) => n.getBoundingClientRect().width,
      );
      await f.locator(".diagram-nav [data-view=in]").click();
      await f.waitForFunction(
        (w) =>
          document.querySelector("svg [data-node-id]").getBoundingClientRect()
            .width > w,
        before,
      );
      await f.locator(".diagram-nav [data-view=reset]").click();
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}/${d.id}`,
      );
      const frameBytes = await p
        .locator("#diagram-frame")
        .screenshot({ path: path.join(destination, `${width}-${d.id}.png`) });
      receipt.captures.push({
        file: `${width}-${d.id}.png`,
        sha256: createHash("sha256").update(frameBytes).digest("hex"),
        diagram: d.id,
        width,
      });
      if (width === 390) {
        if (d.id === "ecs-delivery") {
          await f.locator(".fit-width").click();
          await f.locator(".diagram-nav [data-view=in]").click();
          await f.locator(".diagram-container.is-pannable").waitFor();
          await p.locator("#diagram-frame").scrollIntoViewIfNeeded();
          const svg = await f.locator(".diagram-container").boundingBox();
          const oldX = await node.evaluate(n => n.getBoundingClientRect().x);
          await p.mouse.move(svg.x + 20, svg.y + 100);
          await p.mouse.down();
          await p.mouse.move(svg.x + 80, svg.y + 130, {steps: 8});
          await p.mouse.up();
          await f.waitForFunction(x => Math.abs(document.querySelector("svg [data-node-id]").getBoundingClientRect().x - x) > 10, oldX);
          const bytes = await p.locator("#diagram-frame").screenshot({path:path.join(destination,"mobile-delivery-pan.png")});
          receipt.captures.push({file:"mobile-delivery-pan.png",sha256:createHash("sha256").update(bytes).digest("hex")});
        }
        await p.getByRole("button", {name: "Reading sheet", exact: true}).click();
        const reader = await (await p.locator("#diagram-frame").elementHandle()).contentFrame();
        await reader.waitForURL("**/reading/" + d.id + ".html");
        await reader.locator("article").first().waitFor();
        await assertEnglish(reader);
        assert(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(await reader.locator("a[href]").count(), 0);
        const references = reader.locator("a[aria-disabled=true]");
        assert((await references.count()) > 0);
        assert(await references.evaluateAll(nodes => nodes.every(node => {
          const style = getComputedStyle(node);
          node.focus();
          return style.textDecorationLine === "none" && style.cursor === "auto" &&
            node.ownerDocument.activeElement !== node;
        })));
        await reader.locator("article").first().scrollIntoViewIfNeeded();
        await capture(p, "mobile-reading-" + d.id);
        await p.getByRole("button", {name: "Back to diagram", exact: true}).click();
      }
    }
    await selectDiagram(p, "ecs-delivery");
    if ([1440, 390].includes(width))
      await capture(p, width === 1440 ? "desktop-explorer" : "mobile-explorer");
  }
  await p.getByRole("button", { name: "Reading sheet", exact: true }).click();
  const reader = await (
    await p.locator("#diagram-frame").elementHandle()
  ).contentFrame();
  await reader.waitForURL("**/reading/ecs-delivery.html");
  await reader.locator("article").first().waitFor();
  assert.equal(await reader.locator("a[href]").count(), 0);
  await p.getByRole("button", { name: "Back to diagram", exact: true }).click();
  await p.locator(".textual summary").click();
  await p.locator("[data-inspect]").first().click();
  assert((await p.locator("#node-inspector .source-links a").count()) > 0);
  pass(
    "Five pinned diagrams desktop/mobile, zoom/fit, opaque sandbox, sources, reader and text alternative",
  );
  for (const width of [320, 390, 768, 1440, 1920]) {
    await p.setViewportSize({ width, height: 844 });
    for (const view of ["/demo", "/architecture"]) {
      await navigate(p, view);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}${view}`);
      assert(await p.locator("h1").evaluate((n) => n === document.activeElement));
      assert.equal(await p.locator("#space-nav a[aria-current=page]").getAttribute("href"), view);
      await p.evaluate(() => window.scrollTo(0, 0));
      await capture(p, `${width}-${view.slice(1)}`);
    }
  }
  assert.equal(apiCalls, 0);
  assert.deepEqual(receipt.externalRequests, []);
  pass("DEMO zero API/external calls, two visible workspace tabs, keyboard focus/Escape and five responsive widths");
  const staticDirectory = path.join(destination, "static-package");
  receipt.staticManifest = await build(staticDirectory);
  const staticServer = await createPreview(staticDirectory);
  servers.push(staticServer);
  await new Promise((r) => staticServer.listen(0, "127.0.0.1", r));
  const staticOrigin = `http://127.0.0.1:${staticServer.address().port}`;
  const sc = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const staticRequests = [];
  await sc.route("**/*", (r) => {
    if (new URL(r.request().url()).origin !== staticOrigin) {
      staticRequests.push(r.request().url());
      return r.abort();
    }
    return r.continue();
  });
  const sp = await sc.newPage();
  sp.on("pageerror", (e) => receipt.browserErrors.push(e.message));
  await sp.goto(staticOrigin + "/");
  assert.equal(new URL(sp.url()).pathname, "/demo");
  await sp.goto(staticOrigin + "/demo/");
  await sp.locator(".message-row").first().waitFor();
  await sp
    .locator("#message")
    .fill("Standalone static package · prueba sintética");
  await sp.locator("#send").click();
  await sp
    .locator(".message-row")
    .filter({ hasText: "Standalone static package" })
    .waitFor();
  await sp.goto(staticOrigin + "/architecture/?diagram=ecs-delivery");
  await capture(sp, "static-explorer");
  assert.equal(new URL(sp.url()).searchParams.get("diagram"), "ecs-delivery");
  await sp.reload();
  assert.match(await sp.locator("#diagram-frame").getAttribute("src"), /ecs-delivery/);
  assert.deepEqual(staticRequests, []);
  await sc.close();
  pass(
    "Reproducible static package: direct/trailing-slash routes, DEMO write/read and isolated diagram without backend",
  );
  // An explicit AWS-mode local server with no real upstream. Tests label fault injection as doubles.
  let behavior = "healthy",
    upstreamCalls = 0;
  const token = randomBytes(32).toString("hex");
  const aws = await serve({
    mode: "aws",
    token,
    endpoint: "https://example123.execute-api.us-east-1.amazonaws.com",
    authorizedUntil: Date.parse("2026-11-09T04:00:00Z"),
    now: () => Date.parse("2026-11-07T01:00:00Z"),
    fetcher: async (url) => {
      upstreamCalls++;
      if (behavior === "http")
        return new Response("{}", {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      if (behavior === "network") throw new Error("Injected connection loss");
      if (behavior === "timeout")
        throw new DOMException("Injected upstream deadline", "TimeoutError");
      return new Response(
        JSON.stringify(
          url.includes("/text") ? [] : { status: "Healthy", checks: [] },
        ),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const ac = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    colorScheme: "dark",
  });
  await ac.route("**/*", (r) =>
    new URL(r.request().url()).origin === aws ? r.continue() : r.abort(),
  );
  const a = await ac.newPage();
  await a.goto(aws + "/demo#session=" + token);
  assert(!a.url().includes(token));
  assert.equal(upstreamCalls, 0);
  for (const b of ["http", "network", "timeout"]) {
    behavior = b;
    await a.locator("#refresh").click();
    await a.locator("#list-status .error").waitFor();
    await assertEnglish(a);
    assert.equal(await a.locator(".message-row").count(), 0);
    assert.match(await a.locator("#global-mode").innerText(), /AWS/);
  }
  await capture(a, "aws-offline-double");
  behavior = "healthy";
  await a.getByRole("button", { name: "Check connection" }).click();
  await a.locator("#health-result").filter({ hasText: "SQL + KMS" }).waitFor();
  await ac.setOffline(true);
  await a.locator("#refresh").click();
  await a.locator("#list-status .error").waitFor();
  assert.equal(await a.locator(".message-row").count(), 0);
  await ac.setOffline(false);
  await a.reload();
  await a.locator("#refresh").click();
  await a
    .locator("#list-status .error")
    .filter({ hasText: "locked" })
    .waitFor();
  pass(
    "HTTP 503 / timeout / lost connection / expired in-memory capability: no synthetic fallback",
  );
  pass("English shell, DEMO copy, AWS errors, five diagrams and five reading sheets");
  assert.deepEqual(receipt.browserErrors, []);
  receipt.status = "PASS";
} catch (e) {
  receipt.status = "FAIL";
  receipt.error = e.stack;
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const s of servers) await new Promise((r) => s.close(r));
  await writeFile(
    path.join(destination, "BROWSER-QA.json"),
    JSON.stringify(receipt, null, 2),
  );
  console.log(
    JSON.stringify({
      status: receipt.status,
      error: receipt.error,
      checks: receipt.checks,
      captures: receipt.captures.length,
      external: receipt.externalRequests,
      errors: receipt.browserErrors,
    }),
  );
}
