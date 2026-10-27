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

// Read by the Worker; see README.md for what each one does.
const settings = [
  "MODULES",
  "FORGE",
  "FORGE_OWNER",
  "FORGE_URL",
  "FORGE_TOPIC",
  "FORGE_TOKEN",
  "CACHE_TTL",
];

export default defineConfig({
  worker: {
    name: env("WORKER_NAME") || "vanity",
    compatibilityDate: "2026-10-23",
    entrypoint,
    domains: domain ? [domain] : [],
    // Settings are secrets. Declared secrets are required, so only the ones
    // set here are declared: dev reads those from .env, and deploys with
    // --secrets-file .env upload them. Deploys without .env (such as from CI)
    // declare none and keep the values already on the Worker.
    env: Object.fromEntries(
      settings.filter((key) => env(key)).map((key) => [key, bindings.secret()]),
    ),
  },
});
