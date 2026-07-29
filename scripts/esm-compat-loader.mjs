// Node ESM loader hooks that let scripts import the app's src/lib modules
// unchanged. The app source relies on two webpack conveniences Node's loader
// doesn't provide: extensionless relative imports ("./wineResolver") and
// attribute-less JSON imports ("./wineUnified.json"). Registered by
// backfill-rec-rating-dna.mjs via node:module register().

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (
    specifier.startsWith(".") &&
    !/\.[a-z0-9]+$/i.test(specifier) &&
    context.parentURL
  ) {
    const candidate = new URL(specifier + ".js", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return next(candidate.href, context);
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".json")) {
    const source = await readFile(fileURLToPath(new URL(url)), "utf8");
    return { format: "module", source: `export default ${source};`, shortCircuit: true };
  }
  return next(url, context);
}
