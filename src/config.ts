import { forges } from "./forges/index.ts";
import { NAME } from "./sources.ts";

/** Raised for invalid deployment settings; the message names the setting. */
export class ConfigError extends Error {}

/** Settings shared by every forge plugin. */
export type ForgeConfig = {
  owner: string;
  url?: string;
  token?: string;
  topic: string;
};

export type Config = {
  modules: Record<string, string>;
  /** `key` identifies the forge's answers in the cache. */
  forge?: { name: string; options: ForgeConfig; key: string };
  ttl: number;
};

// The env doesn't change within an isolate, so it is read once.
const parsed = new WeakMap<Env, Config>();

/** Reads and validates settings from the Worker env. Empty values count as unset. */
export function config(env: Env): Config {
  let config = parsed.get(env);
  if (!config) {
    config = read(env);
    parsed.set(env, config);
  }
  return config;
}

function read(env: Env): Config {
  // Secrets that were never uploaded are missing at runtime, whatever the types say.
  const text = (value: string | undefined) => value?.trim() || undefined;

  const ttl = text(env.CACHE_TTL) ?? "3600";
  if (!/^\d+$/.test(ttl)) {
    throw new ConfigError("CACHE_TTL must be a non-negative whole number of seconds");
  }

  const config: Config = { modules: modules(text(env.MODULES)), ttl: Number(ttl) };

  const forge = text(env.FORGE);
  if (forge) {
    if (!Object.hasOwn(forges, forge)) {
      throw new ConfigError(`FORGE "${forge}" is not one of: ${Object.keys(forges).join(", ")}`);
    }
    const owner = text(env.FORGE_OWNER);
    if (!owner) throw new ConfigError("FORGE_OWNER is required when FORGE is set");
    const url = text(env.FORGE_URL);
    if (url !== undefined && !URL.canParse(url)) {
      throw new ConfigError(
        "FORGE_URL must be an absolute URL like https://ghe.example.com/api/v3",
      );
    }
    const topic = text(env.FORGE_TOPIC) ?? "go";
    config.forge = {
      name: forge,
      options: { owner, url, token: text(env.FORGE_TOKEN), topic },
      // The token is left out: it doesn't change the answers.
      key: JSON.stringify([forge, url, owner, topic]),
    };
  }

  return config;
}

/** MODULES is a JSON object mapping module names to repository URLs. */
function modules(json: string | undefined): Record<string, string> {
  if (json === undefined) return {};
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ConfigError("MODULES is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigError('MODULES must be a JSON object like {"name": "https://..."}');
  }
  for (const [name, url] of Object.entries(value)) {
    if (!NAME.test(name) || typeof url !== "string") {
      throw new ConfigError(`MODULES entry "${name}" must be a valid name mapped to a URL`);
    }
  }
  return value as Record<string, string>;
}
