// Node ESM resolve hook so plain-node tests can import REAL route modules:
// - rewrites the Next.js "@/..." path alias to src/
// - rewrites extensionless Next entrypoints ("next/server") that Node's
//   ESM resolver rejects outside the Next bundler
// Registered via module.register() in the route test suites.

const SRC = new URL("../../../", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(SRC + specifier.slice(2) + (specifier.endsWith(".js") ? "" : ".js"), context);
  }
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  if (specifier === "next/headers") {
    return nextResolve("next/headers.js", context);
  }
  return nextResolve(specifier, context);
}
