import { edition } from "./config.mjs";
import { createDemo, createAws, MAX_BYTES } from "./api.mjs";
import { atlas } from "./atlas.mjs";
import { redirectFor } from "./site-routes.mjs";
const fragment = new URLSearchParams(location.hash.slice(1)),
  token = fragment.get("session") ?? "";
if (fragment.has("session"))
  history.replaceState(null, "", location.pathname + location.search);
const api = edition === "demo" ? createDemo() : createAws(token);
const main = document.querySelector("main"),
  announce = document.querySelector("#announcer");
let current = "/",
  pageNumber = 1,
  busy = false,
  lastCreated = null,
  diagramListener = null,
  closeViewer = null;
const $ = (q) => document.querySelector(q);
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const c of children.flat())
    if (c != null)
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const badge = (text, tone = "") => el("span", { class: "badge " + tone }, text);
const link = (text, href) =>
  el("a", { href, "data-route": "", class: "text-link" }, text);
const button = (text, onclick, kind = "", attrs = {}) =>
  el("button", { type: "button", class: kind, onclick, ...attrs }, text);
const heading = (title, description, extra) =>
  el(
    "div",
    { class: "page-heading" },
    el("div", {}, el("h1", { tabindex: "-1" }, title), el("p", {}, description)),
    extra,
  );
const editionBadge = (id) => el(
  "span",
  { id, class: "badge " + (edition === "demo" ? "green" : "amber") },
  edition === "demo" ? "DEMO · SYNTHETIC DATA" : "AWS · LOCAL SESSION",
);
const legacyAnchors = new Map([
  ["#nuevo-mensaje", "new-message"],
  ["#mensajes-recuperados", "retrieved-messages"],
  ["#contexto", "context"],
]);
const diagramURL = (id) => "/architecture?diagram=" + id;

function workspace(title, active, nav, selector) {
  $("#workspace-sidebar").replaceChildren(
    el("div", { class: "workspace-name" }, title, el("span", {}, "Cloud Resilience Laboratory")),
    nav,
    el(
      "div",
      { class: "sidebar-bottom" },
      editionBadge(),
      el("p", {}, current === "/architecture"
        ? "Design and historical results. No live telemetry."
        : edition === "demo"
          ? "Data stays in this tab. No AWS requests or KMS encryption."
          : "Live DEV API. Supervised local session. DEMO data is never used as a fallback."),
    ),
  );
  $("#workspace-context").replaceChildren(
    el(
      "nav",
      { class: "breadcrumbs", "aria-label": "Breadcrumb" },
      current === "/architecture" ? link("Architecture", "/architecture") : el("span", {}, "Workspace"),
      el("span", { class: "slash", "aria-hidden": "true" }, "/"),
      el("span", { "aria-current": "page" }, active),
    ),
    ...(selector ? [selector] : []),
  );
}
function say(text) {
  announce.textContent = text;
}
function error(target, e) {
  target.replaceChildren(el("div", { class: "error", role: "alert" }, e.message));
}
function setToggle(control, active, label, activeLabel) {
  control.setAttribute("aria-pressed", String(active));
  control.textContent = active ? activeLabel : label;
}
function navigate(url, focus = true) {
  const u = new URL(url, location.origin);
  history.pushState(null, "", u.pathname + u.search + u.hash);
  render(focus);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-route]");
  if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey &&
      !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    navigate(a.href);
  }
});
addEventListener("popstate", () => render(true));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeViewer?.();
});
$("#footer-mode").textContent = edition === "aws"
  ? "AWS DEV · supervised local session"
  : "Standalone DEMO · synthetic data";
function render(focus = false) {
  if (diagramListener) removeEventListener("message", diagramListener);
  diagramListener = null;
  closeViewer = null;
  const route = location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "") || "/";
  const redirect = redirectFor(route, new URLSearchParams(location.search).get("scenario"));
  if (redirect || route !== location.pathname)
    history.replaceState(null, "", redirect || route + location.search + location.hash);
  current = location.pathname;
  main.className = current === "/architecture" ? "view-architecture" : "view-demo";
  main.replaceChildren();
  document.body.classList.toggle("architecture-space", current === "/architecture");
  document.querySelectorAll("#space-nav a").forEach((a) => {
    if (new URL(a.href).pathname === current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (current === "/architecture") architecture();
  else if (current === "/demo") {
    workspace("Text Demo", "Messages", el(
      "nav",
      { class: "demo-nav", "aria-label": "Text workspace" },
      el("a", { href: "#new-message" }, "New message"),
      el("a", { href: "#retrieved-messages" }, "Retrieved messages"),
    ));
    product();
  } else {
    main.append(heading("This page does not exist.", "Open one of the lab workspaces."), link("Text Demo", "/demo"));
  }
  const anchor = document.getElementById(legacyAnchors.get(location.hash) ?? location.hash.slice(1));
  if (anchor) anchor.focus();
  else if (focus) $("h1")?.focus();
  document.title = ($("h1")?.textContent ?? "ECS") + " | Cloud Resilience Laboratory";
}

function product() {
  main.append(
    heading(
      "Text Demo",
      edition === "demo"
        ? "Explore how a .NET API receives, encrypts, stores, and retrieves text. This demo uses synthetic data."
        : "Explicit connection to AWS DEV. Use only non-sensitive synthetic text. Messages are stored in SQL.",
      editionBadge("global-mode"),
    ),
  );
  const health = el(
    "div",
    { id: "health-result", class: "health-strip" },
    badge(
      edition === "demo" ? "SIMULATED" : "UNCHECKED",
      edition === "demo" ? "amber" : "",
    ),
    el(
      "p",
      {},
      edition === "demo"
        ? "The DEMO does not monitor AWS health."
        : "Check connectivity to the API, SQL, and KMS.",
    ),
    button(
      edition === "demo" ? "How it works" : "Check connection",
      async () => {
        if (edition === "demo") {
          flow.select(1);
          return;
        }
        const b = health.querySelector("button");
        b.disabled = true;
        try {
          const h = await api.health();
          health.querySelector("p").textContent =
            `Liveness: ${h.live} · Readiness: ${h.ready} · SQL + KMS`;
          health.querySelector(".badge").textContent = "HEALTHY";
          say("AWS connection verified");
        } catch (e) {
          health.querySelector("p").textContent = e.message;
          health.querySelector(".badge").textContent = "OFFLINE / ERROR";
        } finally {
          b.disabled = false;
        }
      },
      "quiet",
    ),
  );
  const notice = el("div", { id: "request-status" }),
    input = el("textarea", {
      id: "message",
      rows: "4",
      placeholder: "Write a short message to try the flow.",
      required: "",
      maxlength: "4096",
      name: "message",
      autocomplete: "off",
      "aria-describedby": "message-help",
    }),
    count = el("span", { class: "counter" }, "0 / 4096 bytes");
  input.addEventListener(
    "input",
    () =>
      (count.textContent = `${new TextEncoder().encode(input.value).length} / ${MAX_BYTES} bytes`),
  );
  const submit = el(
    "button",
    { type: "submit", class: "primary", id: "send" },
    edition === "demo" ? "Create synthetic message →" : "Save to AWS →",
  );
  const form = el(
    "form",
    {
      id: "message-form",
      novalidate: "",
      onsubmit: async (e) => {
        e.preventDefault();
        if (busy) return;
        busy = true;
        submit.disabled = true;
        notice.replaceChildren();
        flow.select(1);
        try {
          lastCreated = await api.create(input.value);
          flow.select(2);
          notice.append(
            el(
              "div",
              { class: "success", role: "status" },
              `Message #${lastCreated.id} created. ${edition === "demo" ? "Stored in local memory." : "Live POST confirmed. Select Refresh to verify persistence."}`,
            ),
          );
          input.value = "";
          count.textContent = "0 / 4096 bytes";
          pageNumber = 1;
          if (edition === "demo") await load();
          say("Message created");
        } catch (e) {
          error(notice, e);
        } finally {
          busy = false;
          submit.disabled = false;
        }
      },
    },
    el("label", { for: "message" }, "Message"),
    input,
    el("div", { class: "form-bottom" }, count, submit),
    el(
      "p",
      { class: "fine", id: "message-help" },
      edition === "demo"
        ? "The message stays in this tab and is not encrypted. Reload to restore the examples."
        : "Do not enter personal data. The proxy allows up to two writes per session.",
    ),
  );
  const list = el("div", { id: "messages", class: "message-list" }),
    listStatus = el("div", { id: "list-status" }),
    pageLabel = el("span", { id: "page-label" }, "Page 1");
  async function load() {
    const loadButton = $("#refresh");
    if (loadButton) loadButton.disabled = true;
    listStatus.textContent = "Loading messages…";
    try {
      const rows = await api.list(pageNumber, 5);
      list.replaceChildren();
      if (!rows.length)
        list.append(
          el("div", { class: "empty" }, "There are no messages on this page."),
        );
      for (const row of rows) {
        list.append(
          el(
            "article",
            { class: "message-row", "data-id": row.id },
            el(
              "div",
              { class: "message-meta" },
              badge(`#${row.id}`),
              el(
                "time",
                {},
                new Date(row.createdAt)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 19) + " UTC",
              ),
              lastCreated?.id === row.id ? badge("THIS SESSION", "green") : null,
            ),
            el("p", {}, row.text),
          ),
        );
      }
      pageLabel.textContent = "Page " + pageNumber;
      listStatus.textContent =
        edition === "demo"
          ? "Synthetic data in memory."
          : `Live GET: ${rows.length} records. Ciphertext is not exposed.`;
      flow.select(3);
      say("Messages loaded");
    } catch (e) {
      list.replaceChildren();
      error(listStatus, e);
    } finally {
      if (loadButton) loadButton.disabled = false;
    }
  }
  const flow = flowPanel();
  main.append(
    el(
      "div",
      { class: "workspace-grid" },
      el(
        "div",
        { class: "workspace-primary" },
        el(
          "section",
          { class: "panel composer", id: "new-message", tabindex: "-1" },
          el(
            "div",
            { class: "panel-title" },
            el("h2", {}, "New message"),
            edition === "aws" ? badge("POST /text") : null,
          ),
          form,
          notice,
        ),
        el(
          "section",
          { class: "panel messages-panel", id: "retrieved-messages", tabindex: "-1" },
          el(
            "div",
            { class: "panel-title" },
            el(
              "div",
              {},
              el("h2", {}, "Retrieved messages"),
              el("p", {}, "Newest first · five per page"),
            ),
            el(
              "div",
              { class: "actions" },
              edition === "demo"
                ? button(
                    "Reset",
                    () => {
                      api.reset();
                      notice.replaceChildren();
                      lastCreated = null;
                      pageNumber = 1;
                      load();
                      say("Synthetic data reset");
                    },
                    "quiet",
                    { id: "reset" },
                  )
                : null,
              button("Refresh ↻", load, "quiet", { id: "refresh" }),
            ),
          ),
          listStatus,
          list,
          el(
            "div",
            { class: "pagination" },
            button(
              "← Previous",
              () => {
                if (pageNumber > 1) {
                  pageNumber--;
                  load();
                }
              },
              "quiet",
            ),
            pageLabel,
            button(
              "Next →",
              () => {
                if (pageNumber < 20) {
                  pageNumber++;
                  load();
                }
              },
              "quiet",
            ),
          ),
        ),
      ),
      el("div", { class: "workspace-support" }, flow.node, health),
    ),
  );
  if (edition === "demo") load();
  else
    list.append(
      el(
        "div",
        { class: "empty" },
        "AWS is queried only on request. Check the connection, then select Refresh.",
      ),
    );
}
function flowPanel() {
  const details = [
    "HTTP API → VPC Link → ALB → ECS. The backend receives text. The DEV API does not authenticate users.",
    "The app calls Encrypt in KMS. The DEMO illustrates this step without generating ciphertext.",
    "SQL stores the ciphertext received from the backend. A successful POST does not let the browser inspect the disk or database.",
    "GET retrieves a page of records. The backend calls Decrypt and returns text. The browser checks the ID and content.",
  ];
  const detail = el("p", { id: "flow-detail" }, details[0]);
  const buttons = ["Receive", "Encrypt", "Store", "Retrieve"].map(
    (name, i) =>
      button(
        `${String(i + 1).padStart(2, "0")}  ${name}`,
        () => select(i),
        "flow-step",
        { "aria-pressed": i === 0 },
      ),
  );
  function select(i) {
    buttons.forEach((b, j) => {
      b.classList.toggle("selected", j === i);
      b.setAttribute("aria-pressed", String(j === i));
    });
    detail.textContent = details[i];
  }
  return {
    select,
    node: el(
      "section",
      { class: "panel flow-panel" },
      el(
        "div",
        { class: "panel-title" },
        el("h2", {}, "How a message flows"),
      ),
      el("div", { class: "flow" }, buttons),
      detail,
      link("Explore the ECS platform", "/architecture?diagram=ecs-platform"),
    ),
  };
}

function architecture() {
  const requested = new URLSearchParams(location.search).get("diagram");
  const d = atlas.find((x) => x.id === requested) ?? atlas[0];
  const diagramNav = el(
    "nav",
    { id: "diagram-nav", "aria-label": "Architecture diagrams" },
    atlas.map((diagram) =>
      el(
        "a",
        {
          href: diagramURL(diagram.id),
          "data-route": "",
          "aria-current": diagram === d ? "page" : null,
        },
        diagram.label,
      ),
    ),
  );
  const selector = el(
    "select",
    {
      id: "diagram-select",
      "aria-label": "Choose diagram",
      onchange: (e) => {
        navigate(diagramURL(e.target.value), false);
        $("#diagram-select").focus({ preventScroll: true });
      },
    },
    atlas.map((diagram) =>
      el("option", { value: diagram.id, selected: diagram === d }, diagram.label),
    ),
  );
  workspace("Architecture Explorer", d.label, diagramNav, selector);
  const frame = el("iframe", {
    id: "diagram-frame",
    src: "/diagrams/" + d.id + ".html",
    title: d.title,
    sandbox: "allow-scripts",
    referrerpolicy: "no-referrer",
    loading: "eager",
  });
  const reading = button(
    "Reading sheet",
    () => {
      const active = reading.getAttribute("aria-pressed") === "true";
      setToggle(reading, !active, "Reading sheet", "Back to diagram");
      frame.src = (active ? "/diagrams/" : "/reading/") + d.id + ".html";
    },
    "quiet",
    { "aria-pressed": "false", "aria-controls": "diagram-frame" },
  );
  const expand = button(
    "Expand view",
    () => setExpanded(!canvas.classList.contains("expanded")),
    "quiet",
    { "aria-pressed": "false", "aria-controls": "diagram-frame" },
  );
  const canvas = el(
    "section",
    { class: "diagram-stage", "aria-label": "Architecture viewer" },
    el(
      "div",
      { class: "diagram-toolbar" },
      el("strong", {}, d.label),
      el("div", { class: "actions" }, d.reading ? reading : null, expand),
    ),
    frame,
    el(
      "p",
      { class: "viewer-help" },
      "Use +, −, or Fit in the diagram. Drag to pan, or open the reading sheet.",
    ),
  );
  function setExpanded(active) {
    canvas.classList.toggle("expanded", active);
    setToggle(expand, active, "Expand view", "Restore size");
  }
  function closeExpanded() {
    if (expand.getAttribute("aria-pressed") !== "true") return;
    setExpanded(false);
    expand.focus();
  }
  closeViewer = closeExpanded;
  main.append(
    heading(d.title, d.description),
    el("p", { class: "diagram-status" }, "Evidence from November 2026 · No live telemetry"),
    canvas,
    diagramContext(d.id),
  );
  const inspector = el("section", {
      class: "panel inspector",
      id: "node-inspector",
    }),
    nodes = el(
      "div",
      { class: "node-list" },
      d.nodes.map((n) =>
        button(n.name, () => inspect(n), "quiet", { "data-inspect": n.id }),
      ),
    );
  function inspect(n) {
    inspector.replaceChildren(
      el("h2", {}, n.name),
      el("p", {}, n.detail),
      el(
        "div",
        { class: "legend" },
        n.status.map((x) =>
          badge(typeof x === "string" ? x : JSON.stringify(x)),
        ),
      ),
      el(
        "div",
        { class: "source-links" },
        n.sources.map((s) =>
          el(
            "a",
            { href: s.url, target: "_blank", rel: "noopener noreferrer" },
            s.path + ":" + s.line + " ↗",
          ),
        ),
      ),
    );
  }
  const relations = el(
    "details",
    { class: "panel textual" },
    el("summary", {}, "Text alternative · Components and relationships"),
    nodes,
    el(
      "ul",
      {},
      d.relations.map((r) =>
        el(
          "li",
          {},
          `${d.nodes.find((x) => x.id === r.from)?.name ?? r.from} → ${d.nodes.find((x) => x.id === r.to)?.name ?? r.to}: ${r.label}`,
        ),
      ),
    ),
  );
  main.append(
    el("div", { class: "architecture-details" }, relations, inspector),
    el(
      "details",
      { class: "source-references" },
      el("summary", {}, "Sources and provenance"),
      el("p", {}, "Archify 3.1.0 · Original SHA-256 ", el("code", {}, d.sha256)),
      el("a", { href: "/sources/" + d.id + ".json", download: d.id + ".json" }, "Download original JSON source"),
    ),
  );
  inspect(d.nodes[0]);
  frame.addEventListener("load", () => say("Diagram loaded"));
  const listener = (e) => {
    if (current !== "/architecture" || !frame.isConnected) {
      removeEventListener("message", listener);
      return;
    }
    if (
      e.source !== frame.contentWindow ||
      e.origin !== "null" ||
      e.data?.type !== "ecs-diagram-node"
    )
      return;
    const n = d.nodes.find((x) => x.id === e.data.id);
    if (n) inspect(n);
  };
  addEventListener("message", listener);
  diagramListener = listener;
}

function diagramContext(id) {
  const context = {
    "ecs-platform": ["POST /text → SQL/KMS → GET /text", "Evidence covers DEV. PROD was never installed or validated."],
    "ecs-delivery": ["Merge → CI → ECR → ECS blue/green", "The disabled PROD path would promote the approved DEV image digest without rebuilding it. Only DEV was deployed and validated."],
    "ecs-network": ["Observed HTTPS recovery in 2m 29.191s", "A DEV trial measured HTTPS recovery after NAT A was replaced. Sentinel observed the trial. Automatic failover between zones was not demonstrated."],
    "ecs-sql-recovery": [
      "Observed RTO: 24m 42.6s SAME-AZ · 41m 31.5s CROSS-AZ",
      "Supervised cold recovery provides no zero-RPO guarantee. Hourly backups were verified with CHECKSUM.",
    ],
    "ecs-trust": ["Final DEV CA, validated-v2 without a temporary trust bridge", "The public DEV API was unauthenticated. TLS and permissions were checked at each boundary."],
  };
  const [result, note] = context[id];
  return el(
    "section",
    { id: "context", tabindex: "-1", class: "panel diagram-context" },
    el("h2", {}, "Results and limitations"),
    el("strong", {}, result),
    el("p", {}, note),
    el("a", {
      class: "text-link",
      href: "https://github.com/Kendall04/cloud-resilience-laboratory/blob/main/docs/RESULTS.md",
      target: "_blank",
      rel: "noopener noreferrer",
    }, "View technical evidence"),
  );
}

render();
