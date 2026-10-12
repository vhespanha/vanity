import { forges } from "./forges/index.ts";

/** Module names: what the first path segment must look like. */
export const NAME = /^[A-Za-z0-9._-]+$/;

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
  forge?: { name: string; options: ForgeConfig };
  ttl: number;
};

/** Reads and validates settings from the Worker env. Empty values count as unset. */
export function config(env: object): Config {
  const vars = env as Record<string, unknown>;
  const text = (key: string) => {
    const value = vars[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };

  const ttl = text("CACHE_TTL") ?? "3600";
  if (!/^\d+$/.test(ttl)) {
    throw new ConfigError("CACHE_TTL must be a non-negative whole number of seconds");
  }

  const config: Config = { modules: modules(vars.MODULES), ttl: Number(ttl) };

  const forge = text("FORGE");
  if (forge) {
    if (!Object.hasOwn(forges, forge)) {
      throw new ConfigError(`FORGE "${forge}" is not one of: ${Object.keys(forges).join(", ")}`);
    }
    const owner = text("FORGE_OWNER");
    if (!owner) throw new ConfigError("FORGE_OWNER is required when FORGE is set");
    config.forge = {
      name: forge,
      options: {
        owner,
        url: text("FORGE_URL"),
        token: text("FORGE_TOKEN"),
        topic: text("FORGE_TOPIC") ?? "go",
      },
    };
  }

  return config;
}

/** MODULES arrives as an object from the config file, or as a JSON string from .dev.vars. */
function modules(value: unknown): Record<string, string> {
  if (value === undefined || value === "") return {};
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new ConfigError("MODULES is not valid JSON");
    }
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
