// Public API contract only. No cloud SDK, credentials, retry or fallback.
export const MAX_BYTES = 4096;
export function validText(text) {
  if (typeof text !== "string" || !text.trim())
    throw new Error("Enter a message.");
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error("Use at most 4096 UTF-8 bytes.");
  return text;
}
// SQL stores DateTime.UtcNow but EF's unspecified DateTime serializes without Z.
// The existing API's UTC contract must not be reinterpreted in the browser's local zone.
export function utcTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)?$/.test(
      value,
    )
  )
    throw new Error("Invalid timestamp.");
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z";
}
export function parseText(value) {
  if (
    !value ||
    !Number.isInteger(value.id) ||
    value.id < 1 ||
    typeof value.text !== "string" ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error("The response does not match DemoTextDto.");
  return { ...value, createdAt: utcTimestamp(value.createdAt) };
}
export function createDemo() {
  let next = 3;
  let rows = [];
  const reset = () => {
    next = 3;
    rows = [
      {
        id: 2,
        text: "Recovery is demonstrated with evidence.",
        createdAt: "2026-11-06T17:04:30Z",
      },
      {
        id: 1,
        text: "Hello, ECS. This message only exists in this tab.",
        createdAt: "2026-11-06T17:01:02Z",
      },
    ];
  };
  reset();
  return {
    mode: "demo",
    get total() {
      return rows.length;
    },
    async health() {
      return { live: "Simulated", ready: "No AWS dependencies" };
    },
    async create(text) {
      const message = validText(text);
      const row = {
        id: next++,
        text: message,
        createdAt: new Date().toISOString(),
      };
      rows.unshift(row);
      return { ...row };
    },
    async list(page = 1, size = 5) {
      return rows.slice((page - 1) * size, page * size).map((x) => ({ ...x }));
    },
    reset,
  };
}
export function createAws(token, request = globalThis.fetch, timeout = 12000) {
  async function call(path, method = "GET", body) {
    if (!token)
      throw new Error(
        "Local session is locked. Open the temporary operator link.",
      );
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      const r = await request("/_api" + path, {
        method,
        headers: {
          "X-ECS-Session": token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: abort.signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      if (!r.ok)
        throw new Error(
          `HTTP ${r.status}. ${method === "POST" ? "The write result is unconfirmed. Do not retry automatically." : "AWS is unavailable. DEMO data is not used."}`,
        );
      return await r.json();
    } catch (e) {
      if (e.name === "AbortError")
        throw new Error(
          "The request timed out. AWS status is unknown. No retry was attempted.",
        );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    mode: "aws",
    async health() {
      const live = await call("/health/live");
      const ready = await call("/ready");
      if (live.status !== "Healthy" || ready.status !== "Healthy")
        throw new Error("AWS dependencies are unhealthy.");
      return { live: live.status, ready: ready.status, checks: ready.checks };
    },
    async create(text) {
      return parseText(await call("/text", "POST", { text: validText(text) }));
    },
    async list(page = 1, size = 5) {
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        page > 20 ||
        ![1, 5, 10].includes(size)
      )
        throw new Error("Pagination exceeds local limits.");
      const rows = await call(`/text?page=${page}&pageSize=${size}`);
      if (!Array.isArray(rows) || rows.length > size)
        throw new Error("Invalid page response.");
      return rows.map(parseText);
    },
  };
}
