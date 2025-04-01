import fsx from "fs-extra";
import handlebars from "handlebars";

export type Options = { noEscape?: boolean };

export const render = <Context = object>(
  template: string,
  context: Context,
  options?: Options,
): string => {
  const { noEscape = true } = { ...options };
  return handlebars.compile(template, { noEscape })(context);
};

export const renderToFile = async <Context = object>(
  file: string,
  template: string,
  context: Context,
  options?: Options & { overwrite?: boolean; format?: boolean },
): Promise<void> => {
  const { overwrite, format, ...renderOpts } = { ...options };
  if (overwrite === false) {
    if (await fsx.exists(file)) {
      return;
    }
  }
  return fsx.outputFile(file, render(template, context, renderOpts), "utf8");
};
