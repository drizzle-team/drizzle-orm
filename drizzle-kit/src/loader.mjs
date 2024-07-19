import esbuild from "esbuild";
import * as path from "path";
import { readFileSync } from "fs";

const parse = (it) => {
  if (!it) return { drizzle: false };

  if (it.endsWith("__drizzle__")) {
    const offset = it.startsWith("file://") ? "file://".length : 0;
    const clean = it.slice(offset, -"__drizzle__".length);
    return { drizzle: true, clean, original: it };
  }
  return { drizzle: false, clean: it };
};

export function resolve(specifier, context, nextResolve) {
  const { drizzle, clean } = parse(specifier);
  if (drizzle && !clean.endsWith(".ts") && !clean.endsWith(".mts")) {
    return nextResolve(clean);
  }

  if (drizzle) {
    return {
      shortCircuit: true,
      url: `file://${specifier}`,
    };
  }

  const parsedParent = parse(context.parentURL);
  const parentURL = parsedParent.drizzle
    ? new URL(`file://${path.resolve(parsedParent.clean)}`)
    : context.parentURL;

  // Let Node.js handle all other specifiers.
  return nextResolve(specifier, { ...context, parentURL });
}

export async function load(url, context, defaultLoad) {
  const { drizzle, clean } = parse(url);
  if (drizzle) {
    const file = readFileSync(clean, "utf-8");
    if (clean.endsWith(".ts") || clean.endsWith(".mts")) {
      const source = esbuild.transformSync(file, {
        loader: "ts",
        format: "esm",
      });
      return {
        format: "module",
        shortCircuit: true,
        source: source.code,
      };
    }
  }

  // let Node.js handle all other URLs
  return defaultLoad(url, context, defaultLoad);
}
