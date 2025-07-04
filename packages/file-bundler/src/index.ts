import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { render, renderToFile } from "@libutil/render";
import crc from "crc/crc32";
import glob from "fast-glob";
import fsx from "fs-extra";
import { parse } from "smol-toml";

type ContextFolder = {
  folder: string;
  files: Array<ResolvedFile>;
};

type Context = {
  files: Array<ResolvedFile>;
  folders: Array<ContextFolder>;
};

type Entry = {
  pattern?: string | Array<string>;
  template?: string | undefined;
  outfile?: string | undefined;
  importBase?: string | undefined;
  folders?: Array<string>;
  filenameReplacements?: Array<[a: string, b: string]>;
  contentReplacements?: Array<[a: string, b: string]>;
  ignore?: string | Array<string>;
  defaultIgnore?: string | Array<string>;
  copyTo?: string | undefined;
};

type ResolvedFile = {
  name: string;
  basename: string;
  path: string;
  relativePath: string;
  folder: string;
  importName: string;
  importPath: string;
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

const entriesMap = parse(
  await fsx.readFile(configFile, "utf8"),
) as unknown as Record<string, Array<Entry>>;

for (const [base, entries] of Object.entries(entriesMap)) {
  for (const _entry of entries) {
    const entry: Required<Entry> = {
      template: undefined,
      outfile: undefined,
      importBase: undefined,
      pattern: "**/*.ts",
      filenameReplacements: [],
      contentReplacements: [],
      folders: [],
      ignore: [],
      defaultIgnore: ["**/_*"],
      copyTo: undefined,
      ..._entry,
    };

    const files = await resolveFiles(base, entry);

    const template = entry.template
      ? await fsx.readFile(resolve(root, entry.template), "utf8")
      : "no template provided";

    const folderMapper = (folder: string) => ({
      folder,
      files: files.filter((f) => f.folder === folder),
    });

    const context: Context = {
      files,
      folders: entry.folders.map(folderMapper),
    };

    if (entry.outfile) {
      await renderToFile(entry.outfile, template, context || {});
    }
  }
}

async function resolveFiles(
  basePattern: string,
  entry: Required<Entry>,
): Promise<Array<ResolvedFile>> {
  const files: Array<ResolvedFile> = [];

  const patterns = [entry.pattern].flat();

  const {
    importBase,
    folders,
    filenameReplacements,
    contentReplacements,
    ignore,
    defaultIgnore,
    outfile,
    copyTo,
  } = entry;

  for (const base of await glob(basePattern, {
    cwd: root,
    onlyDirectories: true,
    absolute: true,
  })) {
    const patternMapper = (p: string) => {
      return folders.length
        ? folders.map((f) => resolve(root, base, f, p))
        : [resolve(root, base, p)];
    };

    const cwd = resolve(root, base);

    const matches = await glob(patterns.flatMap(patternMapper), {
      cwd,
      onlyFiles: true,
      absolute: true,
      ignore: [
        ...(Array.isArray(ignore) ? ignore : ignore ? [ignore] : []),
        ...(Array.isArray(defaultIgnore)
          ? defaultIgnore
          : defaultIgnore
            ? [defaultIgnore]
            : []),
      ],
    });

    for (const path of matches) {
      if (path === resolve(root, outfile || "")) {
        continue;
      }

      const relativePath = path.replace(`${cwd}/`, "");

      const name = [
        // dropping extension
        [/\.([^.]+)$/, ""],
        ...filenameReplacements,
      ].reduce(
        (final, [a, b]) => final.replace(new RegExp(a), b as string),
        relativePath,
      );

      const folder = folders.find((f) => new RegExp(`^${f}/`).test(name)) || "";

      const basename = folder
        ? name.replace(new RegExp(`^${folder}/`), "")
        : name;

      if (copyTo) {
        const dstfile = resolve(
          root,
          render(copyTo, { path, relativePath, folder, name, basename }),
        );

        const content = contentReplacements.reduce(
          (final, [a, b]) => final.replace(new RegExp(a), b),
          await fsx.readFile(path, "utf8"),
        );

        await fsx.outputFile(dstfile, content);
      }

      files.push({
        name,
        basename,
        path,
        relativePath,
        folder,
        importName: `_${name.replace(/[^\w]/g, "_")}_${crc(path)}`,
        importPath: importBase
          ? path.replace(root, importBase).replace(/\.([^.]+)$/, "")
          : `./${name}`,
      });
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}
