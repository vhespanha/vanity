import type { ForgeConfig } from "../config.ts";
import type { Module, Source } from "../sources.ts";

type Repo = {
  name: string;
  owner: { login: string };
  private: boolean;
  topics?: string[];
  clone_url: string;
  html_url: string;
  description: string | null;
  default_branch: string;
};

/** Public repositories of one GitHub user or organization that carry the topic. */
export function github({ owner, url, token, topic }: ForgeConfig): Source {
  const api = (url ?? "https://api.github.com").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vanity",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // GitHub stores topics in lowercase.
  topic = topic.toLowerCase();

  /** Fetches a GitHub API URL; null on 404, throws on any other failure. */
  async function get(target: string): Promise<Response | null> {
    const res = await fetch(target, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub responded ${res.status} to ${target}`);
    return res;
  }

  function toModule(repo: Repo): Module | null {
    const published =
      repo.owner.login.toLowerCase() === owner.toLowerCase() &&
      !repo.private &&
      (repo.topics ?? []).includes(topic);
    if (!published) return null;
    const tree = `${repo.html_url}/tree/${repo.default_branch}`;
    const blob = `${repo.html_url}/blob/${repo.default_branch}`;
    return {
      name: repo.name,
      repo: repo.clone_url,
      url: repo.html_url,
      description: repo.description ?? undefined,
      source: { dir: `${tree}{/dir}`, file: `${blob}{/dir}/{file}#L{line}` },
    };
  }

  return {
    async lookup(name) {
      const res = await get(
        `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      );
      if (!res) return null;
      const repo = await res.json<Repo>();
      // GitHub answers for renamed repositories under their old name too.
      return repo.name === name ? toModule(repo) : null;
    },
    async list() {
      const modules: Module[] = [];
      let next: string | undefined =
        `${api}/users/${encodeURIComponent(owner)}/repos?type=owner&per_page=100`;
      while (next) {
        const res = await get(next);
        if (!res) break;
        for (const repo of await res.json<Repo[]>()) {
          const module = toModule(repo);
          if (module) modules.push(module);
        }
        next = res.headers.get("Link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
      }
      return modules;
    },
  };
}
