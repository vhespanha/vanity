import { jsxRenderer } from "hono/jsx-renderer";

import type { Module } from "./sources.ts";

/**
 * The shared document. Pages render their own <title> and <meta> tags, which
 * Hono moves into <head>.
 */
export const renderer = jsxRenderer(
  ({ children }) => (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/.assets/style.css" />
        {/* No favicon; without this, browsers ask for /favicon.ico. */}
        <link rel="icon" href="data:," />
      </head>
      <body>{children}</body>
    </html>
  ),
  { docType: true },
);

export function Index({ host, modules }: { host: string; modules: Module[] }) {
  return (
    <>
      <title>{host}</title>
      <h1>{host}</h1>
      {modules.length ? (
        <ul>
          {modules.map((module) => (
            <li>
              <a href={module.url}>
                <code>
                  {host}/{module.name}
                </code>
              </a>
              {module.description && <p>{module.description}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No modules yet.</p>
      )}
    </>
  );
}

/** The page the Go tool reads: go-import and, when known, go-source. */
export function GoGet({ host, module }: { host: string; module: Module }) {
  const prefix = `${host}/${module.name}`;
  return (
    <>
      <title>{prefix}</title>
      <meta name="go-import" content={`${prefix} git ${module.repo}`} />
      {module.source && (
        <meta
          name="go-source"
          content={`${prefix} ${module.url} ${module.source.dir} ${module.source.file}`}
        />
      )}
      <p>
        <a href={module.url}>{prefix}</a>
      </p>
    </>
  );
}

export function NotFound({ name }: { name: string }) {
  return (
    <>
      <title>Not found</title>
      <h1>Not found</h1>
      <p>
        There is no module named <code>{name}</code> here.
      </p>
      <p>
        <a href="/">See all modules</a>
      </p>
    </>
  );
}

export function ErrorPage({ message }: { message: string }) {
  return (
    <>
      <title>Error</title>
      <h1>Something went wrong</h1>
      <p>{message}</p>
    </>
  );
}
