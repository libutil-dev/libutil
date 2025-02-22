import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";

import fsx from "fs-extra";
import glob from "fast-glob";
import { parse } from "smol-toml";

import { renderToFile } from "./render";

type ContextFolder = {
  folder: string;
  files: Array<ResolvedFile>;
};

type Context = {
  files: Array<ResolvedFile>;
  folders: Array<ContextFolder>;
};

type ContextHandler = (data: Context) => unknown;

type Entry = {
  folders?: Array<string>;
  pattern?: string | Array<string>;
  ignore?: string | Array<string>;
  defaultIgnore?: string | Array<string>;
  template: string;
  outfile: string;
  context?: ContextHandler;
};

type ResolvedFile = {
  name: string;
  basename: string;
  path: string;
  relativePath: string;
  folder: string;
  importName: string;
  importPath: string;
  content: string;
};

const parsedArgs = parseArgs({
  options: {
    config: {
      type: "string",
      short: "c",
    },
  },
});

const configFile = resolve(
  process.cwd(),
  parsedArgs.values.config || "./file-bundler.toml",
);

const root = dirname(configFile);

const entries = parse(
  await fsx.readFile(configFile, "utf8"),
) as unknown as Record<string, Entry>;

for (const [base, _entry] of Object.entries(entries)) {
  const entry: Required<Entry> = {
    pattern: "**/*.ts",
    folders: [],
    ignore: [],
    defaultIgnore: ["**/_*"],
    context: (data) => data,
    ..._entry,
  };

  const files = await resolveFiles(base, entry);

  const template = await fsx.readFile(resolve(root, entry.template), "utf8");

  const folderMapper = (folder: string) => ({
    folder,
    files: files.filter((f) => f.folder === folder),
  });

  const context = entry.context({
    files,
    folders: entry.folders.map(folderMapper),
  });

  await renderToFile(entry.outfile, template, context || {});
}

async function resolveFiles(
  base: string,
  entry: Required<Entry>,
): Promise<Array<ResolvedFile>> {
  const files: Array<ResolvedFile> = [];

  const patterns = Array.isArray(entry.pattern)
    ? entry.pattern
    : [entry.pattern];

  const { folders } = entry;

  const patternMapper = (p: string) => {
    return folders.length
      ? folders.map((f) => resolve(root, base, f, p))
      : [resolve(root, base, p)];
  };

  const cwd = resolve(root, base);

  const matches = await glob(patterns.flatMap(patternMapper), {
    cwd,
    onlyFiles: true,
    objectMode: true,
    ignore: [
      ...(Array.isArray(entry.ignore)
        ? entry.ignore
        : entry.ignore
          ? [entry.ignore]
          : []),
      ...(Array.isArray(entry.defaultIgnore)
        ? entry.defaultIgnore
        : entry.defaultIgnore
          ? [entry.defaultIgnore]
          : []),
    ],
  });

  for (const match of matches) {
    if (match.path === resolve(root, entry.outfile)) {
      continue;
    }

    const relativePath = match.path.replace(`${cwd}/`, "");

    const name = relativePath.replace(/\.([^.]+)$/, "");

    // biome-ignore format:
    const folder = entry.folders.find(
        (f) => new RegExp(`^${f}/`).test(name)
      ) || "";

    const content = await fsx.readFile(match.path, "utf8");

    files.push({
      name,
      basename: folder ? name.replace(new RegExp(`^${folder}/`), "") : name,
      path: match.path,
      relativePath,
      folder,
      importName: `$${name.replace(/[^\w]/g, "_")}`,
      importPath: `./${name}`,
      content,
    });
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}
