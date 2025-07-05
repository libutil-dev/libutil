import { resolve } from "node:path";

import { render } from "@libutil/render";
import crc from "crc/crc32";
import fsx from "fs-extra";

const fileGeneratorQueue: Record<
  string,
  Array<() => Promise<void>> | undefined
> = {};

export const fileGenerator = (
  base: string,
  baseOptions?: {
    formatters?: Array<(content: string, file: string) => string>;
  },
) => {
  const generatedFiles = new Set<string>();

  type Render = {
    template: string;
    context: object;
  } & import("@libutil/render").Options;

  type Options = {
    /**
     * Controls whether to overwrite an existing file.
     * - `false`: skip writing if the file already exists
     * - `true` (default): always overwrite
     * - function: custom logic to decide whether to overwrite, based on current file content
     */
    overwrite?: boolean | ((fileContent: string) => boolean);
  };

  function generateFile(
    outfile: string,
    render: Render,
    options?: Options,
  ): Promise<void>;

  function generateFile(
    outfile: string,
    content: string,
    options?: Options,
  ): Promise<void>;

  async function generateFile(
    ...args: [f: string, c: string | Render, o?: Options]
  ) {
    const [outfile, content, options] = args;
    const file = resolve(base, outfile);

    const worker = async () => {
      const renderedContent =
        typeof content === "string"
          ? content
          : render(content.template, content.context);

      const formattedContent = Array.isArray(baseOptions?.formatters)
        ? baseOptions.formatters.reduce((c, f) => f(c, file), renderedContent)
        : renderedContent;

      /**
       * Two fs calls (exists + read) are worth it to avoid touching the file
       * and triggering watchers unnecessarily.
       * */
      if (await fsx.exists(file)) {
        const { overwrite = true } = { ...options };
        if (overwrite === false) {
          return;
        }
        const fileContent = await fsx.readFile(file, "utf8");
        if (typeof overwrite === "function" && !overwrite(fileContent)) {
          return;
        }
        if (crc(formattedContent) === crc(fileContent)) {
          return;
        }
      }

      await fsx.outputFile(file, formattedContent, "utf8");
    };

    if (Array.isArray(fileGeneratorQueue[file])) {
      fileGeneratorQueue[file]?.push(worker);
      return;
    }

    fileGeneratorQueue[file] = [];

    try {
      await worker();
      for (const worker of fileGeneratorQueue[file] || []) {
        await worker();
      }
      generatedFiles.add(file);
    } finally {
      fileGeneratorQueue[file] = undefined;
    }
  }

  return {
    generateFile,
    generatedFiles,
  };
};
