// Five current presentation derivatives; authentic generation pins remain unchanged.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { adaptArchify, diagramPolicy } from "../archify.mjs";
import { englishLabel, englishPresentation } from "./archify-english.mjs";
const root = new URL("../../docs/interactive/", import.meta.url);
const current = JSON.parse(await readFile(new URL("GENERATION-CURRENT.json", root), "utf8"));
const entries = [
  ["ecs-platform", "ECS platform", "From public client to private SQL", "API Gateway, ALB and interchangeable colors, with KMS, SQL TLS, and backups. Evidence covers DEV. PROD was not validated."],
  ["ecs-delivery", "API CI/CD Pipeline", "From Merge to DEV Deployment", "GitHub Actions checks the merged commit, publishes the image to ECR by digest, deploys to ECS blue/green, and records the release. Terraform runs separately."],
  ["ecs-network", "Networking & NAT Recovery", "Two Availability Zones, Independent NAT Recovery", "Each zone has its own NAT instance and Auto Scaling group. Replacement restores egress within that zone. ECS can run in either zone. SQL runs in zone B."],
  ["ecs-sql-recovery", "SQL backups and recovery", "One writer, verifiable backups", "Hourly backups and supervised SAME-AZ and CROSS-AZ cold recovery."],
  ["ecs-trust", "Identity and TLS", "Trust by environment", "Private access, ECS execution, administration, and backup boundaries. DEV uses the final CA. The public API was unauthenticated."],
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const cache = new Map();
async function sourceBytes(id) {
  const b = await readFile(new URL("source/" + id + ".json", root));
  const pin = current.diagrams.find((x) => x.id === id);
  if (!pin || sha(b) !== pin.sourceSha256) throw new Error("Changed diagram source");
  return b;
}
export async function catalog() {
  return Promise.all(
    entries.map(async ([id, label, title, description]) => {
      const bytes = await sourceBytes(id);
      const spec = JSON.parse(bytes);
      const v2 = current.diagrams.find((x) => x.id === id);
      return {
        id,
        label,
        title,
        description,
        historical: false,
        reading: Boolean(v2),
        sha256: v2.htmlSha256,
        nodes: (spec.components ?? spec.events).map((n) => ({
          id: n.id,
          name: englishLabel(n.label ?? n.title ?? n.id),
          detail: englishLabel(n.sublabel ?? n.description ?? ""),
          status: (n.tag ? [n.tag] : (n.tags ?? [])).map(englishLabel),
          sources: (n.sources ?? []).map((s) => ({
            path: s.path,
            line: s.line,
            url: `https://github.com/Kendall04/cloud-resilience-laboratory/blob/main/${s.path}#L${s.line}${s.end_line ? "-L" + s.end_line : ""}`,
          })),
        })),
        relations: (spec.connections ?? []).map((x) => ({
          from: x.from,
          to: x.to,
          label: englishLabel(x.label),
        })),
      };
    }),
  );
}
export async function diagramAsset(route) {
  if (cache.has(route)) return cache.get(route);
  let asset;
  if (route === "/assets/atlas.mjs")
    asset = {
      body: "export const atlas=" + JSON.stringify(await catalog()) + ";",
      type: "text/javascript",
    };
  else {
    const id = route
      .split("/")
      .at(-1)
      .replace(/\.(html|json)$/, "");
    if (!entries.some((x) => x[0] === id)) return null;
    const v2 = current.diagrams.find((x) => x.id === id);
    if (route.startsWith("/sources/"))
      asset = { body: await sourceBytes(id), type: "application/json" };
    else if (route.startsWith("/reading/")) {
      if (!v2) return null;
      let sheet = await readFile(
        new URL("readable/" + id + ".html", root),
        "utf8",
      );
      const pin = v2;
      if (sha(sheet) !== (pin.readingSha256 ?? pin.htmlSha256))
        throw new Error("Changed accepted reading sheet");
      sheet = sheet.replace(" Los doce diagramas históricos conservan sus bytes.", "");
      sheet = sheet.replace(
        /(<a\b[^>]*?)\s+href="[^"]*"/g,
        '$1 aria-disabled="true"',
      );
      asset = { body: englishPresentation(sheet), type: "text/html", policy: diagramPolicy };
    } else {
      const raw = await readFile(new URL(id + ".html", root));
      let html = adaptArchify(
        raw,
        v2.htmlSha256,
      );
      html = html.replace(
        "</body>",
        `<script>document.documentElement.setAttribute('data-theme','dark');document.addEventListener('click',function(e){var n=e.target.closest('[data-node-id]');if(n)parent.postMessage({type:'ecs-diagram-node',id:n.getAttribute('data-node-id')},'*');});</script></body>`,
      );
      asset = { body: englishPresentation(html), type: "text/html", policy: diagramPolicy };
    }
  }
  cache.set(route, asset);
  return asset;
}
