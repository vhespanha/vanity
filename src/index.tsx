import { Hono } from "hono";

import { config, ConfigError, NAME } from "./config.ts";
import { forges } from "./forges/index.ts";
import { ErrorPage, GoGet, Index, NotFound, renderer } from "./pages.tsx";
import { cached, combine, manual, type Source } from "./sources.ts";

import css from "./style.css?inline";

/** Manual modules first, then the configured forge behind the edge cache. */
function sources(env: object): Source {
  const { modules, forge, ttl } = config(env);
  if (!forge) return manual(modules);
  const { owner, url = "", topic } = forge.options;
  const key = [forge.name, url, owner, topic].join(" ");
  return combine(manual(modules), cached(forges[forge.name](forge.options), key, ttl));
}

const app = new Hono<{ Bindings: Env }>();

// Registered before the module route, so it never resolves as a module.
app.get("/style.css", (c) =>
  c.body(css, 200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

app.use(renderer);

app.get("/", async (c) => {
  const host = new URL(c.req.url).host;
  const modules = await sources(c.env).list();
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
  c.status(502);
  return c.render(<ErrorPage message="Could not reach the module source. Try again later." />);
});

export default app;
