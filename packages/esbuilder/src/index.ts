import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { build } from "esbuild";
import glob from "fast-glob";
import colors from "kleur";
import ora from "ora";
import { workspaceRoot } from "workspace-root";

const pkg = await import(resolve(process.cwd(), "./package.json"), {
  with: { type: "json" },
}).then((e) => e.default);

const { values, positionals } = parseArgs({
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
    outdir: {
      type: "string",
      short: "o",
    },
  },
  allowPositionals: true,
});

if (!values.outdir?.length) {
  console.error(colors.red("Please provide -o/--outdir\n"));
  process.exit(1);
}

const nodeVersion = (pkg.nodeVersion || process.version)
  .replace(/[^\d.]/g, "")
  .split(".")[0];

const customConfigImport = values.config
  ? () => {
      const file = resolve(process.cwd(), values.config!);
      return file.endsWith(".json")
        ? import(file, { with: { type: "json" } })
        : import(file);
    }
  : undefined;

const customConfig = customConfigImport
  ? await customConfigImport().then((e) => e.default)
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
    const spinner = ora({ spinner: "dots2" }).start(text);

    await new Promise((resolve) => {
      // TODO: cross-platform support?
      const child = execFile("bash", [script], (error, stdout, stderr) => {
        if (error) {
          spinner.fail();
          console.error(colors.red(error.message));
          console.log(stdout);
          console.error(stderr);
          process.exit(1);
        }

        if (stderr?.trim()) {
          spinner.text = `${spinner.text}\n${colors.red(stderr)}`;
        }

        if (stdout?.trim()) {
          spinner.text = `${spinner.text}\n${colors.cyan(stdout)}`;
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

const loader = {
  ...customConfig?.loader,
  // commandline loaders should override loaders from the config
  ...values.loader?.reduce((a: Record<string, string>, e) => {
    const [k, v] = e.split("=");
    a[k] = v;
    return a;
  }, {}),
};

const spinner = ora().start(positionals.join("; "));

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
    // loader should override customConfig.loader
    loader,
    // un-overridable options
    entryPoints: positionals,
    outdir: values.outdir,
  });
  spinner.succeed();
} catch (error) {
  spinner.fail();
  console.error(error);
  process.exit(1);
}
