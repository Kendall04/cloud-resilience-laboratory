// Static package preview only. No proxy, AWS client or fallback to source files.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSP_DEMO } from "./server.mjs";
import { diagramPolicy } from "../archify.mjs";
import { pageRoutes, redirectFor } from "./site-routes.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function* responseChunks(bytes) {
  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    yield bytes.subarray(offset, offset + chunkSize);
}
export async function createPreview(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "MANIFEST.json"), "utf8"),
  );
  if (
    manifest.schema !== "ECS_PORTFOLIO_STATIC_V1" ||
    manifest.edition !== "demo" ||
    manifest.awsProxy !== false ||
    sha(JSON.stringify(manifest.files)) !== manifest.contentSHA256
  )
    throw new Error("Invalid DEMO manifest");
  const files = new Map();
  for (const entry of manifest.files) {
    if (
      !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(entry.path) ||
      entry.path.split("/").some((p) => p === "..") ||
      files.has(entry.path)
    )
      throw new Error("Invalid package path");
    files.set(entry.path, entry);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", CSP_DEMO);
    if (
      req.headers.host !== `127.0.0.1:${server.address().port}` ||
      !req.url?.startsWith("/") ||
      req.url.startsWith("//") ||
      /%|\\/.test(req.url.split("?")[0])
    ) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const destination = redirectFor(url.pathname, url.searchParams.get("scenario"));
    if (destination) {
      res.writeHead(308, { Location: destination });
      res.end();
      return;
    }
    const route = url.pathname.replace(/\/$/, "");
    const name = Object.hasOwn(pageRoutes, route) ? pageRoutes[route] : url.pathname.slice(1);
    const entry = files.get(name);
    if (!entry) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const bytes = await readFile(path.join(directory, name));
      if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256)
        throw new Error("Changed package");
      if (/^(diagrams|reading)\//.test(name))
        res.setHeader("Content-Security-Policy", diagramPolicy);
      const type = name.endsWith(".html")
        ? "text/html"
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".ttf")
            ? "font/ttf"
            : name.endsWith(".txt")
              ? "text/plain"
              : name.endsWith(".mjs")
                ? "text/javascript"
                : "application/json";
      res.writeHead(200, {
        "Content-Type": type + "; charset=utf-8",
        "Content-Length": bytes.length,
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      // Stream the verified buffer with backpressure for large diagram responses.
      await pipeline(Readable.from(responseChunks(bytes)), res);
    } catch {
      if (res.headersSent || res.destroyed) return res.destroy();
      res.writeHead(503);
      res.end("Package integrity check failed");
    }
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw new Error(
      "Usage: node portfolio/product/preview.mjs <built-directory>",
    );
  const server = await createPreview(path.resolve(process.argv[2]));
  server.listen(4183, "127.0.0.1", () =>
    console.log("DEMO static preview: http://127.0.0.1:4183/demo"),
  );
}
