import { buildRequest, type PostOptions, stringifyData } from "./base";

export default function post<T = unknown>(
  url: string | URL,
  data: string | Record<string, unknown> = {},
  options: PostOptions = {},
) {
  return buildRequest<T>(
    url,
    { ...options, method: "POST" },
    { ...options.headers },
    (request) => {
      if (!request.getHeader("Content-Type")) {
        request.setHeader("Content-Type", "application/x-www-form-urlencoded");
      }

      if (data) {
        request.write(stringifyData(request, data));
      }

      request.end();
    },
  );
}
