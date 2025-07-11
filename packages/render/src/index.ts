import { join } from "node:path";

import crc from "crc/crc32";
import fsx from "fs-extra";
import handlebars from "handlebars";

export type Options = { noEscape?: boolean };

export type FactoryOptions = Options & {
  /**
   * Controls whether to overwrite an existing file.
   * - `false`: skip writing if the file already exists
   * - `true` (default): always overwrite
   * - function: custom logic to decide whether to overwrite, based on current file content
   */
  overwrite?: boolean | ((fileContent: string) => boolean);
  formatters?: Array<Formatter>;
};

type Formatter = (content: string, file: string) => string;

export const render = <Context = object>(
  template: string,
  context: Context,
  options?: Options,
): string => {
  const { noEscape = true } = { ...options };
  return handlebars.compile(template, { noEscape })(context);
};

export const renderAsFile = <Context = object>(
  file: string,
  template: string,
  context: Context,
  options?: Omit<FactoryOptions, "overwrite">,
): string => {
  const { formatters, ...renderOpts } = { ...options };
  const content = render(template, context, renderOpts);
  return Array.isArray(formatters)
    ? formatters.reduce((c, f) => f(c, file), content)
    : content;
};

export const renderToFile = async <Context = object>(
  file: string,
  template: string,
  context: Context,
  options?: FactoryOptions,
): Promise<void> => {
  const content = renderAsFile(file, template, context, options);

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
    if (crc(content) === crc(fileContent)) {
      return;
    }
  }

  await fsx.outputFile(file, content, "utf8");
};

export const renderFactory = (outdir: string, options?: FactoryOptions) => {
  return {
    async renderToFile<Context = object>(
      file: string,
      template: string,
      context: Context,
      selfOptions?: FactoryOptions,
    ) {
      return renderToFile(join(outdir, file), template, context, {
        ...options,
        ...selfOptions,
      });
    },
  };
};
