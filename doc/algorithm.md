# The MemTree Algorithm

MemTree is a knowledge base for humans and AI agents, structured as a tree of documents (see
`Document` in `@memtree.wiki/docs`). Every node in the tree is a document, and every document
carries a semantic embedding.

**Version 1**, described below, is deliberately conservative: it has no notion of deletion at
all, explicit or implicit. Once a node exists it stays in the tree forever — its *content* can
change (merge, split), but the tree never loses a node. Why, and what a later version might do
about it, is discussed in [Open Questions](#open-questions).

## Agent operations

An AI agent interacting with the tree can:

- **search** the tree — find documents relevant to a query via semantic similarity.
- **read** a specific document.
- **add** a new document to the tree.

There is no **delete**/**remove** operation in v1 — see
[Open Question 1](#1-how-does-information-get-deleted-if-at-all).

## Parameters

The algorithm is governed by three parameters:

- **L** — max document length (text length).
- **D** — max out-degree (number of children per node).
- **T** — similarity threshold for merging; a new document merges into an existing one when their
  embeddings are at least `T` similar.

## Self-maintenance

The tree maintains its own shape in the background as documents are added, so that no document
exceeds `L` and no node exceeds `D` children:

- **Merge on add** (v1). When a new document is added, if its similarity to an existing document
  is at least `T`, it is merged into that document instead of being inserted as a new node. This
  never removes anything: an add either becomes a brand-new node or is absorbed into an existing
  one, so node count only ever grows or stays flat.

- **Split on overflow** (v1). When a document's length exceeds `L`, it is split into a parent
  document and child documents. The original document's existing children are reattached under
  the new parent. Ideally the split yields documents with length below `L / 2`. Purely additive
  to the tree — one node becomes several — so this one is settled and considered fine as-is.

- **Cluster on fan-out** (v1, unresolved). When a document has more than `D` children, its
  children are clustered and merged down into at most `D / 2` documents. As specified, this
  doesn't actually fit v1's no-deletion rule: merging several children down into fewer
  necessarily removes nodes, just via content-merge rather than an explicit delete call. It's
  also not implemented yet — `projects/wiki/src/index.ts` has `Merge`/`Split` types and a
  `split()` maintenance loop, but no `Cluster` type or fan-out equivalent of
  `getSpillableNodes`. This needs more thinking before it can be called settled — see
  [Open Question 2](#2-how-does-information-go-up-the-tree).

Any operation that changes a document's content (add, merge, or split) invalidates its embedding,
which must be recomputed before the document is searchable again — a memory layer whose retrieval
relies on stale embeddings fails silently rather than loudly.

## Advantages

- MemTree is optimized both for human and AI consumption. It is token efficient, and it is
  structured to facilitate semantic search and retrieval.
- MemTree can be used as an always up-to-date knowledge wiki for humans and AI agents.

## Open Questions

### 1. How does information get deleted, if at all?

**What's already there.** Before designing anything: `Store` (`projects/wiki/src/index.ts`)
already has the primitives —

```ts
del: (nodeId: nodeId) => Promise<void>
setParent: (child: nodeId, parent: nodeId | null) => Promise<void>
```

Neither is called anywhere yet. `Node` has `created: Date` but nothing like `lastAccessed` — so
"track last access time" isn't free, it's a schema addition plus an update on every read.

**Explicit, restricted, or automatic?** Likely explicit *and* automatic, doing different jobs
rather than competing for the same one:

- *Explicit removal* — a human or agent says "this is wrong/obsolete," and it's gone. This is
  the only mechanism that can act on *correctness*: no amount of usage tracking tells you a fact
  went stale, only an agent that actually read it and knows the domain can. It should be
  unrestricted at this layer, the same as `add` — the algorithm/storage packages have no concept
  of "users" or permissions anywhere today (`Document`, `Node`, `Store` are all identity-free).
  If restriction is wanted, it belongs in `api-web` (the one package that will eventually know
  what a "user" is), as a check before it calls into the tree, not as something the algorithm
  itself understands.

- *Automatic removal* — plausible via last-access, but it should never be the thing that
  hard-deletes. A document that's rarely *searched* isn't the same as a document that's *wrong*;
  foundational, rarely-queried facts are exactly the ones you don't want silently vaporized
  because nothing happened to ask about them this month. A safer shape: track `lastAccessed`
  (bumped on `read`, not on merely appearing in `search` results — showing up in top-K is a
  noisy signal of use, an explicit `read` is a real one), add a staleness-horizon parameter, and
  have background maintenance *archive* stale nodes (excluded from `search`, still reachable via
  `read`, reversible) rather than hard-delete them. Hard delete stays explicit-only.

**Mechanics of an explicit delete.** What a `remove` op has to do depends on where the target
sits in the tree:

- *Leaf, no children.* `await store.del(nodeId)` — trivial, nothing else references it.

- *Internal node, has a parent.* Don't cascade the delete — reuse `store.setParent` to reparent
  each child up to *its* parent, the same way `split` already keeps a node's pre-existing
  children attached across a content rewrite:

  ```ts
  const node = await store.get(nodeId)
  for (const child of node.children) {
    await store.setParent(child, node.parent)
  }
  await store.del(nodeId)
  ```

  A node being stale or wrong says nothing about its children's validity, so the subtree
  survives, just one level shallower — deleting an internal node flattens that level rather than
  pruning it.

  Whether this is actually a good idea is its own question. The retrieval-facing case for it is
  solid: `search` here is flat and embedding-based, not path-based, and `read` returns just a
  node plus its `parent` id, not ancestor content — so a child's discoverability and content
  don't depend on which internal node sits above it, and reparenting is invisible to
  search/read. The real cost is structural, not retrieval: an internal node with several
  children is usually a synthesized *category* (that's what `split`/`cluster` produce), and
  deleting it while keeping its children erases the grouping, potentially dumping unrelated
  siblings onto the grandparent — which could itself push the grandparent over `D`. That's fine
  when the node had one child (a clean unwrap) or only its own summary was wrong while the
  grouping still holds; it's questionable when the deletion means the whole cluster no longer
  belongs together, in which case reparenting everything up just relocates the problem instead
  of resolving it.

- *Root, no children.* Deleting it just empties the tree — already handled for free, since the
  next `add` finds no search hit and calls `store.add(doc, null)` exactly as it does today,
  minting a fresh root.

- *Root, has children.* The reparent-to-parent move doesn't work here — the root's `parent` is
  `null`, and reparenting every child to `null` produces a forest, not a tree, breaking the
  one-root invariant `search`/`split` implicitly assume. No free default. Leaning toward
  forbidding it — `remove` on a root with children errors — and requiring the tree be brought
  down to a single child first by some other means.

Two consequences fall out of allowing deletion at all, independent of which case above:

- The search index has to drop the node **synchronously** with the delete, not lazily. Content
  edits merely *invalidate* an embedding until it's recomputed, which is fine because the
  stale-but-present node is still valid to return. A deleted node can't get the same treatment —
  if `search` can still surface a `nodeId` that `get` no longer has, `read` on it throws.

- Deletion races the background maintenance queues. A node can be sitting in the `split` queue
  (or a future cluster/absorb queue), picked up by e.g. `getSpillableNodes`, and then get
  explicitly removed before that queued job runs — which would then act on a `nodeId` that no
  longer exists. Not solved here, just flagged: maintenance loops need to treat "node no longer
  exists by the time I act on it" as an expected outcome, not an assumption violation.

### 2. How does information go up the tree?

**Current state.** All three self-maintenance rules above only push content
*outward/downward*: merge-on-add acts sideways at the single node `add` happens to land on;
split-on-overflow pushes a node's content down into new children; cluster-on-fan-out merges
*siblings into each other* but never feeds anything back into the parent. So today the tree can
only ever get more specific over time. There's no operation that recognizes "several children
have converged on saying roughly the same thing, and that thing belongs one level up" — the
inverse of what `split` does — and a tree that only specializes and never generalizes will just
accumulate redundant, duplicated content across siblings as the underlying knowledge matures.

**Two ways to do the "up" move, and which fits this codebase.** The general version is content
surgery: given several children that partially overlap, extract the common part into the parent
and leave each child with just its delta. That needs reasoning below the whole-document level
(e.g. per-`Element`), but the current embedding model (`Embed = (doc: Document) => Promise<Vector>`
in `embedder.ts`) only produces one vector per *document*, not per paragraph — there's no
existing signal to locate "the overlapping part" of two docs, only how similar they are as
wholes.

Given that, the design that actually fits what's already built is coarser but reuses every
primitive that exists today — **absorb on similarity**: if a child's embedding is similar to its
*parent's* embedding at or above `T` (the same `T` and `merge` that already govern merge-on-add),
the child has stopped saying anything the parent doesn't already cover, so fold it back in:

```ts
// sketch, mirrors the shape of the existing split() maintenance loop
absorb: async () => {
  const pairs = await store.getAbsorbableNodes(T) // parent/child pairs, cosine(parent, child) >= T
  for (const { parent, child } of pairs) {
    const merged = merge([parent.doc, child.doc])
    await store.update(parent.nodeId, merged)
    for (const grandchild of child.children) {
      await store.setParent(grandchild, parent.nodeId)   // reuse from Open Question 1
    }
    await store.del(child.nodeId)                          // reuse from Open Question 1
  }
}
```

Why this shape rather than the fancier extraction version:

- Reuses `merge`, `store.del`, and `store.setParent` as-is — no new LLM-driven "diff two
  documents and extract the common part" primitive needed, which is a much bigger and shakier
  thing to design well in a codebase where most of this is still stubs.
- Symmetric with merge-on-add: same threshold `T`, same `merge` function, just checked across
  the parent-child edge instead of against the top search hit at write time.
- Composes with `split` for free: if enough children get absorbed that the parent's content
  exceeds `L`, the existing split path picks it up on the next pass and re-differentiates it.
  That gives a self-correcting cycle — absorb compresses toward generality, split expands toward
  specificity — instead of only ever growing in one direction.
- Directly needs Open Question 1's `del`/reparent logic: a child fully absorbed into its parent
  *is* a deletion. The two open questions aren't independent — "how does a node get removed" is
  a prerequisite for "how does content rise." This is also exactly why **cluster-on-fan-out**
  can't be called settled in v1 (see above): it's already trying to do a version of this
  (merging children down) without a deletion story underneath it.

Root nodes have no parent, so they're naturally excluded from absorption — no special-casing
needed there.

Still open within this: whether `getAbsorbableNodes` should run as a continuous check (like
merge-on-add, evaluated whenever a child changes) or a periodic sweep (like `split`'s
maintenance queue) — periodic fits the "background self-maintenance" framing better, continuous
would catch drift sooner. And whether whole-document similarity is too coarse in practice (a
child that's 80% novel and 20% redundant with its parent won't cross `T` and won't get any
relief) — that's the case finer-grained, per-`Element` extraction would actually solve, but
worth waiting to see if it's a real problem before building that more complex machinery.
