import { Hono } from "hono";

import { config, ConfigError, NAME } from "./config.ts";
import { forges } from "./forges/index.ts";
import { ErrorPage, GoGet, Index, NotFound, renderer, stylesheet } from "./pages.tsx";
import { cached, combine, manual, type Source, SourceError } from "./sources.ts";

/** Manual modules first, then the configured forge behind the edge cache. */
function sources(env: Env): Source {
  const { modules, forge, ttl } = config(env);
  if (!forge) return manual(modules);
  return combine(manual(modules), cached(forges[forge.name](forge.options), forge.key, ttl));
}

const app = new Hono<{ Bindings: Env }>();

app.use(renderer);

// Its first segment starts with a dot, so it can never be a module name.
// Pages link it with a content hash in the query, so it can be cached for good.
app.get("/.assets/style.css", (c) =>
  c.body(stylesheet.css, 200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
  }),
);

app.get("/", async (c) => {
  const host = new URL(c.req.url).host;
  const modules = (await sources(c.env).list()).filter((module) => NAME.test(module.name));
  return c.render(<Index host={host} modules={modules} />);
});

app.get("*", async (c) => {
  const host = new URL(c.req.url).host;
  // Subpackage paths (/foo/sub/pkg) belong to the module named by the first segment.
  const name = c.req.path.split("/")[1];
  const source = sources(c.env);
  const module = NAME.test(name) ? await source.lookup(name) : null;
  if (!module) {
    c.status(404);
    return c.render(<NotFound name={name} />);
  }
  if (c.req.query("go-get") === "1") return c.render(<GoGet host={host} module={module} />);
  return c.redirect(module.url, 302);
});

app.onError((err, c) => {
  if (err instanceof ConfigError) {
    c.status(500);
    return c.render(<ErrorPage message={`Invalid configuration: ${err.message}`} />);
  }
  console.error(err);
  if (err instanceof SourceError) {
    c.status(502);
    return c.render(<ErrorPage message="Could not reach the module source. Try again later." />);
  }
  c.status(500);
  return c.render(<ErrorPage message="The server hit an unexpected error." />);
});

export default app;
