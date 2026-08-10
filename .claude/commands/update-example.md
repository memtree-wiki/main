---
description: Sync projects/docs/src/example.tsx with the current Document/Element/Inline schema in projects/docs/src/index.tsx
allowed-tools: [Read, Edit, Bash]
---

# Update example

1. Read `projects/docs/src/index.tsx` to get the current `Inline`, `Element`, and `Document`
   Zod schemas — note every literal `type` value each union currently has (e.g. `strong`, `em`,
   `span`, `a` for `Inline`; `h2`, `h3`, `p`, `ol`, `ul`, `table` for `Element`).
2. Read `projects/docs/src/example.tsx` and compare its `doc` object against that list.
3. Update `example.tsx` so that:
   - `doc` is a complete, valid `Document` (matching the current schema's field names/shapes
     exactly) that uses **every** current `Element` type and **every** current `Inline` type at
     least once, forming a short, coherent document that demonstrates the schema's capabilities.
     Add/remove/rename fields to track any schema changes; drop demo content for types that were
     removed from the schema, add demo content for types that are new.
   - The `if (import.meta.main)` block builds the full HTML document — `<html>`, `<head>` with an
     embedded `<style>`, and `<body>` — using JSX (`import h from "vhtml"`), matching this repo's
     JSX/vhtml SSR convention, instead of a hand-written template string. Embed the already
     rendered `html(doc)` (or current equivalent export) markup into the body via
     `dangerouslySetInnerHTML={{ __html: html(doc) }}`, and prefix the rendered JSX with the
     literal `<!doctype html>` string (vhtml has no doctype node). Keep the CSS optimized for
     ease of reading (comfortable line length, readable type scale, light/dark aware).
4. Run `bun run typecheck` from the repo root to confirm `example.tsx` still type-checks against
   the schema.
5. Report in 1-2 sentences what schema changes (if any) you accounted for.
