import { build } from "esbuild";

await build({
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: "linked",
  logLevel: "info",
  target: "node22",
  entryPoints: ["src/index.ts"],
  outdir: "pkg",
});
