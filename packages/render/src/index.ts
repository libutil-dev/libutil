import fsx from "fs-extra";
import handlebars from "handlebars";

export type Options = { noEscape?: boolean };

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
  options?: Options & {
    formatters?: Array<Formatter>;
  },
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
  options?: Options & {
    overwrite?: boolean;
    formatters?: Array<Formatter>;
  },
): Promise<void> => {
  if (options?.overwrite === false) {
    if (await fsx.exists(file)) {
      return;
    }
  }
  await fsx.outputFile(
    file,
    renderAsFile(file, template, context, options),
    "utf8",
  );
};
