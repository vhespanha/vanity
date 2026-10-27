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
| `/.assets/style.css`        | The stylesheet shared by every page                                 |
| Unknown module              | `404` page                                                          |

The first path segment is the module name, so subpackages resolve to their module. Names use letters, digits, `.`, `-` and `_`, and can't start or end with a dot, as in Go. Paths that start with a dot, like `/.assets/`, belong to the server. Import paths use the request's host. `DOMAIN` only chooses where the Worker is published.

## Configuration

Copy `.env.example` to `.env` and fill in what you need. An empty value means unset. `.env` is ignored by git, so the repository holds no deployment values. In `.env`, quote values that contain `#`, such as `MODULES='{"foo":"https://example.com/foo#readme"}'`. Otherwise `#` starts a comment and cuts the value short.

| Setting       | Purpose                                                                        | Default                  |
| ------------- | ------------------------------------------------------------------------------ | ------------------------ |
| `DOMAIN`      | Custom domain the Worker is published to, such as `go.example.com`.            | none                     |
| `WORKER_NAME` | Name of the Worker.                                                            | `vanity`                 |
| `MODULES`     | Manual modules, as JSON: `{"name":"https://repo/url"}`. Wins over the forge.   | none                     |
| `FORGE`       | Forge plugin used for discovery. Currently `github`.                           | none (manual only)       |
| `FORGE_OWNER` | User or organization whose repositories are discovered. Required with `FORGE`. | none                     |
| `FORGE_TOPIC` | Topic a repository needs to be published.                                      | `go`                     |
| `FORGE_URL`   | Forge API base URL, for self-hosted instances.                                 | `https://api.github.com` |
| `FORGE_TOKEN` | Optional token that raises the forge's rate limit.                             | none                     |
| `CACHE_TTL`   | Seconds to cache forge answers, including "not found". `0` disables caching.   | `3600`                   |

`DOMAIN` and `WORKER_NAME` are read when building. Variables already set in the environment take precedence over `.env`, so in CI you set them as build variables.

The other settings are read by the Worker. They are stored on it as secrets, uploaded from `.env` when you deploy with it as the secrets file (see [Deploying](#deploying)). Deploys without the secrets file keep the values already on the Worker. The local dev server reads them from `.env`.

Only public repositories are discovered, even if the token can see private ones.

Invalid settings make every module and index request answer `500` with a message naming the setting.

### Forge token

Unauthenticated GitHub requests are limited to 60 an hour, shared with other Workers on the same IP. Caching keeps the count low, but a token avoids surprises. A token with no scopes (read-only access to public data) is enough. Set `FORGE_TOKEN` in `.env` and deploy with the secrets file. To rotate or remove it, change or clear it in `.env` and deploy with the secrets file again.

## Deploying

Requires Node.js 22.23+, 24.22+ or 26.12+ (the range `cf` supports). `.npmrc` sets `engine-strict`, so `npm install` fails on other versions.

```sh
npm install
cp .env.example .env   # then fill it in
npm run deploy -- --secrets-file .env
```

This deploys the Worker and uploads the runtime settings from `.env` with it. Use the same command after changing a setting. A plain `npm run deploy`, such as from CI, keeps the settings already on the Worker. It fails if they were never uploaded, so the first deploy needs the secrets file. `DOMAIN` and `WORKER_NAME` end up among the uploaded secrets too, which is harmless.

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
