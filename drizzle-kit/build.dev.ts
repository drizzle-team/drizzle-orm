import * as esbuild from "esbuild";
import { cpSync } from "node:fs";

esbuild.buildSync({
  entryPoints: ["./src/utils.ts"],
  bundle: true,
  outfile: "dist/utils.js",
  format: "cjs",
  target: "node16",
  platform: "node",
  external: ["drizzle-orm", "pg-native", "esbuild"],
  banner: {
    js: `#!/usr/bin/env -S node --loader @esbuild-kit/esm-loader --no-warnings`,
  },
});

esbuild.buildSync({
  entryPoints: ["./src/cli/index.ts"],
  bundle: true,
  outfile: "dist/index.cjs",
  format: "cjs",
  target: "node16",
  platform: "node",
  external: [
    "commander",
    "json-diff",
    "glob",
    "esbuild",
    "drizzle-orm",
    "pg-native",
    "better-sqlite3"
  ],
  banner: {
    js: `#!/usr/bin/env -S node --loader ./dist/loader.mjs --no-warnings`,
  },
});

cpSync("./src/loader.mjs", "dist/loader.mjs");
