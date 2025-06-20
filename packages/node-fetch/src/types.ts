import type { Agent } from "node:https";

export type HTTPMethod = "get" | "post" | "put" | "form" | "del";

type SharedOptions = {
  port?: number;
  json?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  agent?: Agent;
};

export type DelOptions = SharedOptions & {};

export type FormOptions = SharedOptions & {
  put?: boolean;
  binary?: boolean;
};

export type GetOptions = SharedOptions & {};

export type PostOptions = SharedOptions & {
  binary?: boolean;
};

export type PutOptions = SharedOptions & {
  binary?: boolean;
};
