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

/**
 * Where modules come from. `lookup` resolves to null when the source does not
 * know the name, and both methods throw a SourceError when the source cannot
 * be reached.
 */
export type Source = {
  lookup(name: string): Promise<Module | null>;
  list(): Promise<Module[]>;
};

/** Raised when a source cannot be reached; answered with 502. */
export class SourceError extends Error {}

/** Modules listed explicitly as name -> repository URL. */
export function manual(modules: Record<string, string>): Source {
  const toModule = (name: string, url: string): Module => ({ name, repo: url, url });
  return {
    lookup: async (name) => (Object.hasOwn(modules, name) ? toModule(name, modules[name]) : null),
    list: async () => Object.entries(modules).map(([name, url]) => toModule(name, url)),
  };
}

/**
 * Caches a source's answers in the edge cache for `ttl` seconds, including
 * "not found". Errors are never cached. `key` must identify the source.
 */
export function cached(source: Source, key: string, ttl: number): Source {
  async function remember<T>(path: string, load: () => Promise<T>): Promise<T> {
    if (ttl === 0) return load();
    const cache = caches.default;
    const request = new Request(`https://vanity.cache/${encodeURIComponent(key)}/${path}`);
    const hit = await cache.match(request);
    if (hit) return hit.json<T>();
    const value = await load();
    const headers = { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` };
    await cache.put(request, new Response(JSON.stringify(value), { headers }));
    return value;
  }
  return {
    lookup: (name) => remember(`lookup/${name}`, () => source.lookup(name)),
    list: () => remember("list", () => source.list()),
  };
}

/** Combines sources; earlier sources win and are asked first. */
export function combine(...sources: Source[]): Source {
  return {
    async lookup(name) {
      for (const source of sources) {
        const module = await source.lookup(name);
        if (module) return module;
      }
      return null;
    },
    async list() {
      const modules = new Map<string, Module>();
      for (const source of sources) {
        for (const module of await source.list()) {
          if (!modules.has(module.name)) modules.set(module.name, module);
        }
      }
      return [...modules.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
  };
}
