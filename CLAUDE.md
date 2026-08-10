# memtree.wiki

A wiki engine. Bun monorepo (workspaces), TypeScript throughout, very early stage — most
packages are still stubs (see `todo.yml` for what's planned/done).

## Structure

```
projects/
  docs/            @memtree-wiki/docs      — content model (Zod schemas)
  wiki/            @memtree-wiki/wiki      — document storage (store/retrieve)
  api/
    common/        @memtree-wiki/api-common — shared API types
    web/            @memtree-wiki/api-web    — Hono HTTP server (the running app)
    client/        @memtree-wiki/api-client — API client package
```

- `docs` defines the canonical page content model with Zod: a `Document` is a `title` +
  `description` + `content: Element[]`, where `Element` is a discriminated union (`p`, `table`,
  more to come) and inline text uses a `format` union (`strong`, `italic`, `span`). This is the
  schema everything else (storage, rendering, API) is expected to build on.
- `wiki` is the storage layer over that content model.
- `api/web` is the actual server (Hono). `api/common` holds types shared between server and
  client; `api/client` is the consumer-facing client package.
- All workspace packages are `"private": true`, export `./src/index.ts` directly (no build step
  for internal consumption — `exports`/`types` both point at source), and have no runtime
  `dependencies` of their own yet beyond what's listed.

## Tooling

- **Bun** workspaces (`projects/*`, `projects/api/*`). Package manager and runtime — use `bun`,
  not `npm`/`node`.
- **TypeScript**, strict, shared base config at `tsconfig.base.json` (ESNext, bundler resolution,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`). Every package's `tsconfig.json` just
  extends it.
- **Zod** (v4) for runtime-validated schemas — this is how the content model in `docs` is defined.
- **Hono** for the HTTP server (`api-web`).
- **vhtml** for JSX → HTML-string server-side rendering. See below.
- **knip** (`knip.ts`) is set up for dead-code/unused-dependency checks (config currently empty).

## Commands

- `bun install` — install everything.
- `bun run dev` — runs `api-web`'s dev server (`bun --hot`).
- `bun run typecheck` — runs `tsc --noEmit` across every workspace package.

## JSX / SSR: vhtml, not React

There is no React/Preact anywhere in this repo. JSX compiles straight to HTML strings via
[`vhtml`](https://github.com/developit/vhtml), configured with the **classic** JSX transform in
`tsconfig.base.json`:

```json
"jsx": "react",
"jsxFactory": "h"
```

This means, in every `.tsx` file:

- You must `import h from "vhtml";` yourself — classic mode does not auto-inject the factory, and
  there is no `jsxImportSource`/automatic runtime configured.
- A JSX expression evaluates directly to a `string`, not a virtual DOM node. `<div>hi</div>` at
  runtime *is* `"<div>hi</div>"`.
- **No fragments.** `vhtml` has no `Fragment` export and none is configured, so `<>...</>` will
  not compile. Return an array instead (vhtml flattens arrays of children fine, e.g.
  `{items.map(...)}`), or wrap in a real element.
- Components are plain functions, not classes/hooks: `(props) => string`. `props.children` is an
  array of already-serialized child strings, not nodes — see `vhtml`'s README for the
  "sortof components" pattern. Because of this, prefer letting the component's prop type be
  inferred/shaped like `{ children: T[] }` rather than hand-writing `children?: unknown` — vhtml's
  types use the shape of `children` to type-check callers.
- `vhtml` HTML-escapes text content and attribute values automatically; use
  `dangerouslySetInnerHTML={{ __html: ... }}` (same convention as React) to inject raw HTML.

`vhtml` + `@types/vhtml` are root-level dependencies (not per-package) since the JSX pragma is
configured centrally in `tsconfig.base.json` and applies repo-wide.
