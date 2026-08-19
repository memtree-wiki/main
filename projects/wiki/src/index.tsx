// Minimal web UI over a memtree store sqlite db: browse tagged messages and filter by tag.
//
//   bun run projects/wiki/src/index.tsx <path-to-db>

import h from "vhtml"
import { createStore, type store } from "@memtree.wiki/store"

const dbPath = process.argv[2] ?? process.env.DB_PATH
if (!dbPath) throw new Error("usage: bun run src/index.tsx <path-to-db> (or set DB_PATH)")

const db = await createStore(dbPath)

const CSS = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.4; }
  h1 { font-size: 1.25rem; }
  .tags { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 1.5rem; }
  .tag { border: 1px solid #8888; border-radius: 999px; padding: 0.15rem 0.6rem; text-decoration: none; font-size: 0.85rem; color: inherit; }
  .tag.active { background: #4a90d9; border-color: #4a90d9; color: #fff; }
  .tag .count { opacity: 0.6; }
  .clear { font-size: 0.85rem; margin-left: 0.5rem; }
  .msgs { list-style: none; padding: 0; }
  .msg { border-bottom: 1px solid #8884; padding: 0.75rem 0; }
  .meta { display: flex; gap: 0.6rem; font-size: 0.8rem; opacity: 0.7; }
  .speaker { font-weight: 600; }
  .text { margin: 0.3rem 0; white-space: pre-wrap; }
  .msg-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip { font-size: 0.75rem; background: #8882; border-radius: 999px; padding: 0.1rem 0.5rem; }
  .empty { opacity: 0.6; }
`

function tagLink(tag: store.TagCount, selected: string[]): string {
  const active = selected.includes(tag.name)
  const next = active ? selected.filter((name) => name !== tag.name) : [...selected, tag.name]
  const href = next.length > 0 ? `/?tags=${next.map(encodeURIComponent).join(",")}` : "/"
  return (
    <a class={active ? "tag active" : "tag"} href={href}>
      {tag.name} <span class="count">{tag.count}</span>
    </a>
  )
}

function msgItem(msg: store.StoredMsg): string {
  return (
    <li class="msg">
      <div class="meta">
        <span class="speaker">{msg.speaker}</span>
        <span class="date">{msg.date.toLocaleString()}</span>
      </div>
      <p class="text">{msg.text}</p>
      <div class="msg-tags">{msg.tags.map((name) => <span class="chip">{name}</span>)}</div>
    </li>
  )
}

function page(tags: store.TagCount[], selected: string[], msgs: store.StoredMsg[]): string {
  return (
    "<!doctype html>" +
    (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>memtree.wiki</title>
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
        </head>
        <body>
          <h1>memtree.wiki</h1>
          <div class="tags">
            {tags.length === 0 ? <span class="empty">No tags yet.</span> : tags.map((tag) => tagLink(tag, selected))}
            {selected.length > 0 ? (
              <a class="clear" href="/">
                clear filter
              </a>
            ) : (
              ""
            )}
          </div>
          <ul class="msgs">{msgs.length === 0 ? <li class="empty">No messages match.</li> : msgs.map(msgItem)}</ul>
        </body>
      </html>
    )
  )
}

const PORT = Number(process.env.PORT ?? 3000)

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname !== "/") return new Response("not found", { status: 404 })

    const selected = (url.searchParams.get("tags") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)

    const [tags, msgs] = await Promise.all([db.listTags(), db.listMessages(selected.length > 0 ? selected : undefined)])

    return new Response(page(tags, selected, msgs), { headers: { "content-type": "text/html; charset=utf-8" } })
  },
})

console.log(`wiki listening on http://localhost:${PORT} (db: ${dbPath})`)
