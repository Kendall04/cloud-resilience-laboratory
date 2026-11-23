export const pageRoutes = {
  "/demo": "demo/index.html",
  "/architecture": "architecture/index.html",
};

export const legacyRedirects = {
  "/": "/demo",
  "/evidence": "/architecture?diagram=ecs-delivery#context",
};

export const resilienceDiagrams = {
  sql: "ecs-sql-recovery",
  backup: "ecs-sql-recovery",
};

export function redirectFor(path, scenario) {
  const route = path.replace(/\/$/, "") || "/";
  if (route === "/resilience") {
    const diagram = Object.prototype.hasOwnProperty.call(resilienceDiagrams, scenario)
      ? resilienceDiagrams[scenario]
      : "ecs-network";
    return "/architecture?diagram=" + diagram + "#context";
  }
  return Object.prototype.hasOwnProperty.call(legacyRedirects, route)
    ? legacyRedirects[route]
    : null;
}
