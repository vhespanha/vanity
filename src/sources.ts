/**
 * Module names: what the first path segment must look like. Like Go path
 * elements, they can't start or end with a dot, which leaves dot paths such as
 * /.assets/ free for the server's own files.
 */
export const NAME = /^(?!\.)[A-Za-z0-9._-]+(?<!\.)$/;

/** A Go module as served by the vanity domain. */
export type Module = {
  name: string;
  /** Git clone URL, used in the go-import tag. */
  repo: string;
  /** Web URL, used for browser redirects and the index. */
  url: string;
  description?: string;
  /** go-source directory and file templates. */
  source?: { dir: string; file: string };
};

/** Where modules come from. `list` throws a SourceError when the source cannot be reached. */
export type Source = {
  list(): Promise<Module[]>;
};

/** Every module the server knows, and a way to find one by name. */
export type Registry = Source & {
  lookup(name: string): Promise<Module | null>;
};

/** Raised when a source cannot be reached; answered with 502. */
export class SourceError extends Error {}

/** Modules listed explicitly as name -> repository URL. */
export function manual(modules: Record<string, string>): Source {
  return {
    list: async () => Object.entries(modules).map(([name, url]) => ({ name, repo: url, url })),
  };
}

/**
 * Caches a source's list in the edge cache for `ttl` seconds. Errors are never
 * cached. `key` must identify the source.
 */
export function cached(source: Source, key: string, ttl: number): Source {
  if (ttl === 0) return source;
  const request = new Request(`https://vanity.cache/${encodeURIComponent(key)}/list`);
  return {
    async list() {
      const cache = caches.default;
      const hit = await cache.match(request);
      if (hit) return hit.json<Module[]>();
      const modules = await source.list();
      const headers = { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` };
      await cache.put(request, new Response(JSON.stringify(modules), { headers }));
      return modules;
    },
  };
}

/**
 * Combines sources; earlier sources win and are asked first. Names that can't
 * be module names, such as a forge's `.github` repository, are left out.
 */
export function combine(...sources: Source[]): Registry {
  const valid = async (source: Source) =>
    (await source.list()).filter((module) => NAME.test(module.name));
  return {
    async lookup(name) {
      for (const source of sources) {
        const module = (await valid(source)).find((module) => module.name === name);
        if (module) return module;
      }
      return null;
    },
    async list() {
      const modules = new Map<string, Module>();
      for (const source of sources) {
        for (const module of await valid(source)) {
          if (!modules.has(module.name)) modules.set(module.name, module);
        }
      }
      return [...modules.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
    },
  };
}
