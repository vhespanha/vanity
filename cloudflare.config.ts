import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.tsx" with { type: "cf-worker" };

// This file runs in Node; declare only what it uses so worker code doesn't
// see Node globals.
declare const process: {
  env: Record<string, string | undefined>;
  loadEnvFile(path: string): void;
};

// Settings come from .env (see .env.example). Variables already set in the
// environment win, since loadEnvFile doesn't overwrite them.
try {
  process.loadEnvFile(".env");
} catch (err) {
  if ((err as { code?: string }).code !== "ENOENT") throw err;
}

const env = (key: string) => process.env[key] ?? "";

const domain = env("DOMAIN");

export default defineConfig({
  worker: {
    name: env("WORKER_NAME") || "vanity",
    compatibilityDate: "2026-10-06",
    entrypoint,
    domains: domain ? [domain] : [],
    // Empty values mean "unset". See README.md for what each setting does.
    env: {
      MODULES: bindings.text(env("MODULES")),
      FORGE: bindings.text(env("FORGE")),
      FORGE_OWNER: bindings.text(env("FORGE_OWNER")),
      FORGE_URL: bindings.text(env("FORGE_URL")),
      FORGE_TOPIC: bindings.text(env("FORGE_TOPIC")),
      CACHE_TTL: bindings.text(env("CACHE_TTL")),
      // A declared secret must be uploaded before deploying, so it's only
      // declared when a token is set.
      ...(env("FORGE_TOKEN") ? { FORGE_TOKEN: bindings.secret() } : {}),
    },
  },
});
