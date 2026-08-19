# memtree.wiki

A memory system for AI agents, built from unstructured conversation dialogs. The goal: turn a
pile of past conversations into something that can answer questions about them efficiently.

**Current milestone (v1): tagging.** Each conversation is processed session by session; every
message in a session is tagged with 0+ short topical tags, reusing existing tags where they fit
and minting new ones only when needed. Tags are the whole memory structure for now — no
summarization, embeddings, or retrieval yet.

## Packages (`projects/*`, bun workspaces)

- `mem` — the tagger. `mem.createTagger()` calls gpt-5-mini over the AI Gateway to tag one chunk
  of messages against a growing tag vocabulary.
- `store` — sqlite-backed storage for tagged messages. `createStore(path)` returns
  `addMessages`, `listTags`, `listMessages(tags?)`.
- `wiki` — a minimal Bun web server over a store db: browse and filter messages by tag.
- `eval` — experiment harness. `ingest` tags the LoCoMo `conv-30` sample session by session into
  a fresh db in `out/`; `baseline` is an unrelated no-memory comparison run.

## Running the v1 flow

```sh
bun install
bun run --filter @memtree.wiki/eval ingest              # tags conv-30 into projects/eval/out/*.db
bun run --filter @memtree.wiki/wiki start -- projects/eval/out/conv-30-<run-id>.db
```

Both `ingest` and `baseline` make real, billed calls against the AI Gateway
(`AI_GATEWAY_API_KEY` in `.env`) — don't run casually.
