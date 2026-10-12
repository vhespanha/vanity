# vanity

Go vanity import paths on a Cloudflare Worker.

Go import paths double as download locations, so `github.com/you/foo` ties every user of your module to GitHub. With a vanity domain, people import `go.example.com/foo`. The domain points the Go tool at wherever the code lives today, and if you move the repository, you change the pointer instead of every import.

vanity finds your modules for you. Tag a repository with the `go` topic and it shows up. Modules on forges without topics, or that you'd rather list by hand, can be listed explicitly.

## What it serves

| Request                     | Response                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `/foo/any/sub?go-get=1`     | HTML with `go-import` (and `go-source` when known) for `<host>/foo` |
| `/foo/any/sub` in a browser | `302` redirect to the repository                                    |
| `/`                         | An index of every module                                            |
| `/style.css`                | The stylesheet shared by every page                                 |
| Unknown module              | `404` page                                                          |

The first path segment is the module name, so subpackages resolve to their module. `/style.css` is reserved for the stylesheet, so no module can be named `style.css`. The domain is taken from the request's host, so it is never configured.

## Configuration

Settings are read from `.env` when the Worker is built or run locally. Copy `.env.example` to `.env` and fill in what you need. Variables already set in the environment take precedence over `.env`, so CI can provide them directly. An empty value means unset. `.env` is ignored by git, so the repository holds no deployment values.

| Setting       | Purpose                                                                        | Default                  |
| ------------- | ------------------------------------------------------------------------------ | ------------------------ |
| `DOMAIN`      | Custom domain the Worker is published to, such as `go.example.com`.            | none                     |
| `WORKER_NAME` | Name of the Worker.                                                            | `vanity`                 |
| `MODULES`     | Manual modules, as JSON: `{"name":"https://repo/url"}`. Wins over the forge.   | none                     |
| `FORGE`       | Forge plugin used for discovery. Currently `github`.                           | none (manual only)       |
| `FORGE_OWNER` | User or organization whose repositories are discovered. Required with `FORGE`. | none                     |
| `FORGE_TOPIC` | Topic a repository needs to be published.                                      | `go`                     |
| `FORGE_URL`   | Forge API base URL, for self-hosted instances.                                 | `https://api.github.com` |
| `FORGE_TOKEN` | Optional token that raises the forge's rate limit. Deployed as a secret.       | none                     |
| `CACHE_TTL`   | Seconds to cache forge answers, including "not found". `0` disables caching.   | `3600`                   |

Settings are fixed when the Worker is built: after changing one, deploy again, or restart `npm run dev`.

Only public repositories are discovered, even if the token can see private ones.

Invalid settings make every request answer `500` with a message naming the setting.

### Forge token

Unauthenticated GitHub requests are limited to 60 an hour, shared with other Workers on the same IP. Caching keeps the count low, but a token avoids surprises. A token with no scopes (read-only access to public data) is enough.

Set `FORGE_TOKEN` in `.env`. The local dev server passes it to the Worker as is. When deploying, it becomes a secret, which Cloudflare needs before the first deploy that declares it. Put the token alone in a separate file, such as `.env.secrets` (also ignored by git):

```sh
FORGE_TOKEN=github_pat_...
```

and upload it with that deploy:

```sh
npm run deploy -- --secrets-file .env.secrets
```

Later deploys keep the uploaded secret. Don't pass `.env` itself as the secrets file, since that would upload every setting as a secret.

## Deploying

```sh
npm install
cp .env.example .env   # then fill it in
npm run deploy
```

With `DOMAIN` set, the Worker is published to that custom domain. The edge cache only works on custom domains, which a vanity domain needs anyway. On `*.workers.dev` everything still works, just uncached.

In each module's `go.mod`, use the vanity path:

```
module go.example.com/foo
```

## Development

```sh
npm run dev        # local server, using .env
npm run typecheck
npm run lint
npm run fmt
```

The dev server reads `.env` when it starts, so restart it after editing.

## Caching

Forge answers are cached per Cloudflare location for `CACHE_TTL` seconds. Adding or removing a topic can take that long to show up. Failed forge requests are never cached and answer `502`, so an outage is not mistaken for a missing module.

## Adding a forge

A forge plugin is a function that takes the shared settings and returns a source with two methods:

```ts
type Source = {
  lookup(name: string): Promise<Module | null>; // null: not published here
  list(): Promise<Module[]>;
};
```

Both throw when the forge cannot be reached. A plugin only fetches and maps. Caching, precedence and HTML are handled for it.

1. Add `src/forges/<name>.ts` exporting a `(config: ForgeConfig) => Source` function. `src/forges/github.ts` is the reference.
2. Register it in `src/forges/index.ts`.
3. Add it to the `FORGE` row above.

Only resolve repositories that belong to `FORGE_OWNER`, are public, and carry `FORGE_TOPIC`.
