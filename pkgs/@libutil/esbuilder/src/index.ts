#!/usr/bin/env -S node --enable-source-maps --no-warnings=ExperimentalWarning

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { execFile } from "node:child_process";

import { build } from "esbuild";
import { workspaceRoot } from "workspace-root";
import glob from "fast-glob";
import ora from "ora";
import colors from "kleur";

const pkg = await import(resolve(process.cwd(), "./package.json"), {
  with: { type: "json" },
}).then((e) => e.default);

const { values } = parseArgs({
  options: {
    config: {
      type: "string",
      short: "c",
    },
    script: {
      type: "string",
      multiple: true,
      short: "s",
    },
    loader: {
      type: "string",
      multiple: true,
      short: "l",
    },
    entrypoint: {
      type: "string",
      multiple: true,
      short: "e",
    },
    outdir: {
      type: "string",
      short: "o",
    },
  },
});

if (!values.outdir?.length) {
  console.error(colors.red("Please provide -o/--outdir\n"));
  process.exit(1);
}

const nodeVersion = (pkg.nodeVersion || process.version)
  .replace(/[^\d.]/g, "")
  .split(".")[0];

const customConfig = values.config
  ? await import(values.config).then((e) => e.default)
  : undefined;

const root = await workspaceRoot();

const scriptPatterns = [];

for (const _pattern of values.script || []) {
  let pattern = _pattern;

  if (pattern.startsWith("@/")) {
    if (!root) {
      throw colors.red(
        "Could not detect workspace root; @/ prefix supported in Monorepos only",
      );
    }
    pattern = pattern.replace("@", root);
  }

  if (pattern.endsWith("/")) {
    pattern = `${pattern}*`;
  }

  scriptPatterns.push(pattern);
}

for (const pattern of scriptPatterns) {
  const scripts = await glob(pattern, {
    onlyFiles: true,
  });

  for (const script of scripts) {
    const text = root ? script.replace(root, "@") : script;
    const spinner = ora().start(text);

    await new Promise((resolve) => {
      // TODO: cross-platform support?
      const child = execFile("bash", [script], (error, stdout, stderr) => {
        if (error) {
          spinner.fail();
          console.error(colors.red(error.message));
          process.exit(1);
        }

        if (stdout?.trim()) {
          spinner.text = `${spinner.text}\n${colors.cyan(stdout)}`;
        }

        if (stderr?.trim()) {
          spinner.text = `${spinner.text}\n${colors.red(stderr)}`;
        }
      });

      child.on("close", (code) => {
        if (spinner.text === text) {
          spinner.text = `${spinner.text}\n`;
        }
        spinner[code === 0 ? "succeed" : "warn"]();
        resolve(code);
      });
    });
  }
}

const loader = values.loader?.length
  ? values.loader.reduce((a: Record<string, string>, e) => {
      const [k, v] = e.split("=");
      a[k] = v;
      return a;
    }, {})
  : undefined;

for (const entryPoint of values.entrypoint || []) {
  const spinner = ora({ interval: 1 }).start(entryPoint);

  try {
    await build({
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      sourcemap: "linked",
      logLevel: "error",
      target: `node${nodeVersion}`,
      ...customConfig,
      // un-overridable options
      entryPoints: [entryPoint],
      outdir: values.outdir,
      ...(loader ? { loader } : {}),
    });
    spinner.succeed();
  } catch (error) {
    spinner.fail();
    console.error(error);
    process.exit(1);
  }
}
