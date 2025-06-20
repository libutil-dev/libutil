A tiny tool to match files in a `[[basedir]]` by `pattern` and emit an `outfile` based on a `template`.

Default config file: `file-bundler.toml` (use `-c/--config` for a custom config file)

Config file should contain an array of tables, eg:

```toml
[["test/fixtures"]]
pattern = "**/*.ts"
template = "test/templates/native.tpl"
outfile = "test/native.test.ts"

[["test/fixtures"]]
pattern = "**/*.ts"
template = "test/templates/recursive.tpl"
outfile = "test/recursive.test.ts"
```

Table signature:

```typescript
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
```

`test/fixtures` is a folder containing files of interest.

`file-bundler` will scan each sub-folder using given pattern.

Matched files signature:

```typescript
type ResolvedFile = {
  name: string;
  basename: string;
  path: string;
  relativePath: string;
  folder: string;
  importName: string;
  importPath: string;
};
```

Matched files and folders provided as context to given `template`:

```typescript
type Context = {
  files: Array<ResolvedFile>;
  folders: Array<ContextFolder>;
};
type ContextFolder = {
  folder: string;
  files: Array<ResolvedFile>;
};
```

Template rendered and saved to `outfile`.

TODO: document `copyTo` and another options.
