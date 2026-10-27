import type { ForgeConfig } from "../config.ts";
import { type Module, type Source, SourceError } from "../sources.ts";

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
    let res: Response;
    try {
      res = await fetch(target, { headers });
    } catch (err) {
      throw new SourceError(`Could not reach ${target}`, { cause: err });
    }
    if (res.status === 401 && headers.Authorization) {
      // A bad token shouldn't take the site down: public data doesn't need one.
      // Logged as an error so it shows up in the Worker's Issues.
      console.error(new Error("GitHub rejected FORGE_TOKEN (401); continuing without it"));
      delete headers.Authorization;
      return get(target);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new SourceError(`GitHub responded ${res.status} to ${target}`);
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
