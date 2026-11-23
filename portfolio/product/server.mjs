import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { proxyHandler, requireAwsSession } from "./proxy.mjs";
import { pageRoutes, redirectFor } from "./site-routes.mjs";
export const CSP_DEMO =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const assets = new Map([
  ...Object.keys(pageRoutes).map((route) => [route, "index.html"]),
  ...[
    "app.mjs",
    "api.mjs",
    "style.css",
    "site-routes.mjs",
  ].map((x) => ["/assets/" + x, x]),
]);
export function createProductServer({
  mode = "demo",
  token = "",
  now = Date.now,
  expires = now() + 15 * 60000,
  endpoint,
  authorizedUntil,
  fetcher,
  onReceipt,
} = {}) {
  if (!["demo", "aws"].includes(mode))
    throw new Error("Explicit demo/aws edition required");
  if (
    mode === "aws" &&
    (!/^[a-f0-9]{64}$/.test(token) ||
      !Number.isFinite(expires) ||
      expires <= now() ||
      expires > now() + 15 * 60000 + 1000 ||
      expires > authorizedUntil)
  )
    throw new Error("AWS session requires bounded token and authorized window");
  const proxy =
    mode === "aws"
      ? proxyHandler({ token, expires, fetcher, onReceipt, now,
          endpoint: requireAwsSession(endpoint, authorizedUntil, now()) })
      : null;
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    res.setHeader(
      "Content-Security-Policy",
      mode === "demo"
        ? CSP_DEMO
        : CSP_DEMO.replace("connect-src 'none'", "connect-src 'self'"),
    );
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (
      req.headers.host !== `127.0.0.1:${address.port}` ||
      !req.url?.startsWith("/") ||
      req.url.startsWith("//") ||
      /%|\\/.test(req.url.split("?")[0])
    ) {
      res.writeHead(400);
      res.end("Invalid local request");
      return;
    }
    const url = new URL(req.url, origin);
    try {
      if (url.pathname.startsWith("/_api/")) {
        if (!proxy) {
          res.writeHead(404);
          res.end("DEMO has no API");
          return;
        }
        await proxy(req, res, url, origin);
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end("Method not allowed");
        return;
      }
      const destination = redirectFor(url.pathname, url.searchParams.get("scenario"));
      if (destination) {
        res.writeHead(308, { Location: destination });
        res.end();
        return;
      }
      const canonical = url.pathname.replace(/\/$/, "");
      const route = Object.hasOwn(pageRoutes, canonical) ? canonical : url.pathname;
      let body,
        type = "text/javascript";
      if (url.pathname === "/assets/config.mjs")
        body = `export const edition=${JSON.stringify(mode)};`;
      else if (assets.has(route)) {
        const file = assets.get(route);
        body = await readFile(new URL(file, import.meta.url));
        type = file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".ttf")
            ? "font/ttf"
            : file.endsWith(".txt")
              ? "text/plain"
              : file.endsWith(".css")
                ? "text/css"
                : "text/javascript";
      } else if (
        url.pathname === "/assets/atlas.mjs" ||
        /^\/(?:diagrams|reading)\/[a-z0-9-]+\.html$/.test(url.pathname) ||
        /^\/sources\/[a-z0-9-]+\.json$/.test(url.pathname)
      ) {
        const { diagramAsset } = await import("./diagrams.mjs");
        const asset = await diagramAsset(url.pathname);
        if (!asset) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        ({ body, type } = asset);
        if (asset.policy)
          res.setHeader("Content-Security-Policy", asset.policy);
      } else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": type + "; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      if (!res.headersSent) res.writeHead(503);
      res.end("Asset or upstream unavailable");
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.some((x) => x !== "--aws"))
    throw new Error(
      "Only --aws is supported; the bind address is loopback",
    );
  const mode = args.includes("--aws") ? "aws" : "demo",
    token = mode === "aws" ? randomBytes(32).toString("hex") : "";
  const authorizedUntil = Date.parse(process.env.ECS_AWS_AUTHORIZED_UNTIL ?? "");
  const server = createProductServer(mode === "aws" ? {
    mode,
    token,
    endpoint: process.env.ECS_AWS_ENDPOINT,
    authorizedUntil,
    expires: Math.min(Date.now() + 15 * 60000, authorizedUntil),
  } : { mode });
  server.on("error", () => {
    console.error("Port unavailable; no existing process adopted");
    process.exitCode = 1;
  });
  server.listen(4182, "127.0.0.1", () =>
    console.log(
      `ECS ${mode.toUpperCase()} · http://127.0.0.1:4182/demo${token ? "#session=" + token : ""}${token ? " · local capability expires in 15 min; keep private" : ""}`,
    ),
  );
  const timer =
    mode === "aws" ? setTimeout(() => server.close(), 15 * 60000) : null;
  for (const event of ["SIGINT", "SIGTERM"])
    process.once(event, () => {
      clearTimeout(timer);
      server.close();
    });
}
