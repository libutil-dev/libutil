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
    overwrite?: boolean;
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
       * Performing two filesystem operations (existence check and read)
       * is a reasonable tradeoff to avoid unnecessarily touching the file,
       * which could otherwise trigger file watchers.
       * */
      if (await fsx.exists(file)) {
        if (options?.overwrite === false) {
          return;
        }
        if (crc(formattedContent) === crc(await fsx.readFile(file, "utf8"))) {
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
