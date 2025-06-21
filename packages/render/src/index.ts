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
  options?: Options & {
    overwrite?: boolean;
    formatters?: Array<(content: string, file: string) => string>;
  },
): Promise<void> => {
  const { overwrite, formatters, ...renderOpts } = { ...options };
  if (overwrite === false) {
    if (await fsx.exists(file)) {
      return;
    }
  }
  const content = render(template, context, renderOpts);
  return fsx.outputFile(
    file,
    Array.isArray(formatters)
      ? formatters.reduce((c, f) => f(c, file), content)
      : content,
    "utf8",
  );
};
