import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.tsx" with { type: "cf-worker" };

// This file runs in Node; declare only what it uses so worker code doesn't
// see Node globals.
declare const process: {
  env: Record<string, string | undefined>;
  loadEnvFile(path: string): void;
};

// DOMAIN and WORKER_NAME come from .env (see .env.example) or, in CI, from
// build variables. Variables already set in the environment win, since
// loadEnvFile doesn't overwrite them.
try {
  process.loadEnvFile(".env");
} catch (err) {
  if ((err as { code?: string }).code !== "ENOENT") throw err;
}

// Empty or whitespace-only values mean "unset".
const env = (key: string) => process.env[key]?.trim() ?? "";

const domain = env("DOMAIN");

export default defineConfig({
  worker: {
    name: env("WORKER_NAME") || "vanity",
    compatibilityDate: "2026-10-06",
    entrypoint,
    domains: domain ? [domain] : [],
    // Runtime settings are secrets, so deploys without a secrets file (such as
    // from CI) keep the values already on the Worker. Dev reads them from .env.
    // See README.md for what each setting does.
    env: {
      MODULES: bindings.secret(),
      FORGE: bindings.secret(),
      FORGE_OWNER: bindings.secret(),
      FORGE_URL: bindings.secret(),
      FORGE_TOPIC: bindings.secret(),
      FORGE_TOKEN: bindings.secret(),
      CACHE_TTL: bindings.secret(),
    },
  },
});
