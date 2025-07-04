import FormData from "form-data";

import { buildRequest, type FormOptions } from "./base";

export default async function form<T = unknown>(
  url: string | URL,
  data: Record<string, unknown>,
  options: FormOptions = {},
) {
  const form = new FormData();

  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) {
      continue;
    }
    form.append(key, isStream(val) ? val : String(val));
  }

  const length: number = await new Promise((resolve, reject) => {
    form.getLength((err: unknown, length: number) => {
      err ? reject(err) : resolve(Number(length));
    });
  });

  const method = options.put ? "PUT" : "POST";

  return buildRequest<T>(
    url,
    { ...options, method },
    { ...options.headers },
    (request) => {
      if (!request.getHeader("Content-Type")) {
        request.setHeader("Content-Type", "multipart/form-data");
      }

      const headerEntries: [k: string, v: string][] = Object.entries(
        form.getHeaders({}),
      );

      for (const [key, val] of headerEntries) {
        request.setHeader(key, val);
      }

      request.setHeader("Content-Length", length);

      form.pipe(request as never);
    },
  );
}

// borrowed from https://www.npmjs.com/package/is-stream
function isStream(
  // biome-ignore lint: any
  stream: any,
) {
  return (
    stream !== null &&
    typeof stream === "object" &&
    typeof stream.pipe === "function"
  );
}
