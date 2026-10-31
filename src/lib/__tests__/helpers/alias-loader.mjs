// Node ESM resolve hook so plain-node tests can import REAL app modules:
// - rewrites the Next.js "@/..." path alias to src/
// - rewrites extensionless Next entrypoints ("next/server") that Node's
//   ESM resolver rejects outside the Next bundler
// - attaches `with { type: "json" }` import attributes to .json imports —
//   Next's bundler allows bare JSON imports (profileEngine → wineUnified)
//   but plain node requires the attribute, so the hook supplies it
// - resolves extensionless relative imports ("./wineResolver" in
//   dnaEvolution.js) to their .js file — the same bundler convenience
//   scripts/esm-compat-loader.mjs supplies for scripts
// Registered via module.register() in the route + archetype test suites.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../../../", import.meta.url).href;

async function withJsonAttributes(resolved) {
  if (resolved?.url?.split("?")[0].endsWith(".json") && !resolved.importAttributes?.type) {
    return { ...resolved, importAttributes: { ...resolved.importAttributes, type: "json" } };
  }
  return resolved;
}

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
  if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier) && context.parentURL) {
    const candidate = new URL(specifier + ".js", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
  }
  return withJsonAttributes(await nextResolve(specifier, context));
}
