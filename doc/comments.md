# Comments on `doc/algorithm.md`

Two gaps in the current algorithm: there's no story for removing information, and
information only ever moves *down* the tree (splits), never *up* (generalization/clustering
never feeds content back into a parent). Notes on both below, grounded in the current
implementation in `projects/wiki/src/index.ts`.

## 1. Removing information

### What's already there

Worth noting before designing anything: `Store` already has the primitives —

```ts
del: (nodeId: nodeId) => Promise<void>
setParent: (child: nodeId, parent: nodeId | null) => Promise<void>
```

Neither is called anywhere yet. `Node` has `created: Date` but nothing like `lastAccessed` —
so "track last access time" isn't free, it's a schema addition plus an update on every read.

### Explicit, restricted, or automatic?

Answer: explicit **and** automatic, but they should do different things, not compete for the
same job.

- **Explicit removal** — a human or agent says "this is wrong/obsolete," and it's gone. Add a
  fourth op alongside `search` / `read` / `add`:

  ```ts
  remove: async ({ docId }: RemoveParams) => { ... }
  ```

  This is the only mechanism that can act on *correctness* — no amount of usage tracking tells
  you a fact went stale, only an agent that actually read it and knows the domain can. It should
  be **unrestricted at this layer**, same as `add`: the algorithm/storage packages have no
  concept of "users" or permissions anywhere today (`Document`, `Node`, `Store` are all
  identity-free). Bolting an ACL onto `remove` alone would be inventing a permission model in
  the one place it's least natural to enforce it. If restriction is wanted, it belongs in
  `api-web` (the one package that will eventually know what a "user" is), as a check before it
  calls into `memTree().remove`, not as a parameter the algorithm itself understands.

- **Automatic removal** — yes, via last-access, but it should never be the thing that
  hard-deletes. Automatic + destructive is a bad combination for a knowledge base: a document
  that's rarely *searched* isn't the same as a document that's *wrong*. Foundational, rarely-
  queried facts are exactly the ones you don't want silently vaporized because nothing happened
  to ask about them this month. So:

  - Add `lastAccessed: Date` to `Node`, bumped on `read` (not on merely appearing in `search`
    results — showing up in top-K is a noisy signal of actual use; an explicit `read` is a real
    one).
  - Introduce a new parameter, say **A** (staleness horizon). Background maintenance — same
    shape as the existing `split` queue — finds nodes with `lastAccessed` older than `A` and
    **archives** them (`archived: boolean` on `Node`): excluded from `store.search` by default,
    still fetchable via `store.get`/`read` if something still points at the id, and reversible.
  - Hard delete (`store.del`) stays explicit-only — never invoked by the background sweep.

  This means "automatic" answers "should this stay in the search index," and "explicit" answers
  "should this exist at all" — two different questions that shouldn't share one trigger.

### Mechanics of an explicit delete

What `remove({ docId })` actually has to do depends on where `docId` sits in the tree:

- **Leaf, no children.** `await store.del(nodeId)`. Nothing else references it, so this is the
  trivial case.

- **Internal node, has a parent.** Don't cascade the delete — reuse `store.setParent` (already
  in `Store`, currently unused) to reparent each of the node's children up to *its* parent, the
  same way `split` already keeps a node's pre-existing children attached across a content
  rewrite:

  ```ts
  const node = await store.get(nodeId)
  for (const child of node.children) {
    await store.setParent(child, node.parent)
  }
  await store.del(nodeId)
  ```

  A node being stale or wrong says nothing about its children's validity, so the subtree
  survives, just one level shallower than before — deleting an internal node flattens that
  level rather than pruning it.

- **Root, no children.** Deleting it just empties the tree. That's already a case the code
  handles for free: the next `add` finds no search hit and calls `store.add(doc, null)` exactly
  as it does today, minting a fresh root.

- **Root, has children.** The reparent-to-parent move from the internal-node case doesn't work
  here — the root's `parent` is `null`, and reparenting every child to `null` would produce a
  forest, not a tree, which breaks the one-root invariant everything else (`search`, `split`)
  implicitly assumes. This case doesn't have a free default the way the others do. Recommend
  forbidding it — `remove` on a root with children errors — and requiring the tree be brought
  down to a single child first (whether by repeated `remove`/absorb from below, or some future
  explicit "promote this child to root" op). Worth deciding deliberately rather than leaving
  implicit, since it's the one branch that can't reuse an existing primitive as-is.

Two consequences that fall out of allowing deletion at all, independent of which case above:

- **The search index has to drop the node synchronously with the delete, not lazily.** The
  existing doc says content edits merely *invalidate* an embedding until it's recomputed —
  that's fine for edits, because the stale-but-present node is still a valid thing to return.
  A deleted node can't get the same treatment: if `store.search` can still surface a `nodeId`
  that `store.get` no longer has, `read` on it throws. `del`'s contract needs to mean "gone from
  the index," not "gone from the table."

- **Deletion races the background maintenance queues.** A node can be sitting in the `split`
  queue (or the proposed `absorb` queue from §2) — picked up by `getSpillableNodes`, say — and
  then get explicitly removed before that queued job runs. The queued job would then call
  `store.update`/`store.setParent` against a `nodeId` that no longer exists. Not solving that
  here, just flagging it as a real consequence of letting `remove` fire at any time: the
  maintenance loops need to treat "node no longer exists by the time I act on it" as an
  expected outcome, not an assumption violation.

## 2. Information moving up the tree

### Current state

`algorithm.md` describes three self-maintenance rules, and all three only push content
*outward/downward*:

- **Merge on add** — sideways, at the single node `add` happens to land on.
- **Split on overflow** — down: a node's content is redistributed into new children.
- **Cluster on fan-out** — also down/sideways in effect: it merges *siblings into each other*
  to shrink fan-out; it never feeds anything back into the parent. (It's also not implemented
  yet — `wiki/src/index.ts` has `Merge` and `Split` types and a `split()` maintenance loop, but
  no `Cluster` type or fan-out equivalent of `getSpillableNodes`.)

So today the tree can only ever get more specific over time. There's no operation that
recognizes "several children have converged on saying roughly the same thing, and that thing
belongs one level up" — which is exactly the inverse of what `split` does, and a tree that only
specializes and never generalizes will just accumulate redundant, duplicated content across
siblings as the underlying knowledge matures.

### Two ways to do the "up" move, and which one fits this codebase

The general version of this problem is content surgery: given several children that partially
overlap, extract the common part into the parent and leave each child with just its delta. That
requires reasoning below the whole-document level (e.g. per-`Element`), and the current
embedding model (`Embed = (doc: Document) => Promise<Vector>` in `embedder.ts`) only produces
one vector per *document*, not per paragraph — there's no existing signal to locate "the
overlapping part" of two docs, only "how similar are these two docs as wholes."

Given that, the design that actually fits what's already built is coarser but reuses every
primitive that exists today:

**Absorb on similarity.** If a child's embedding is similar to its *parent's* embedding at or
above `T` — the same `T` and the same `merge` function that already govern merge-on-add — the
child has stopped saying anything the parent doesn't already cover, so fold it back in:

```ts
// sketch, mirrors the shape of the existing split() maintenance loop
absorb: async () => {
  const pairs = await store.getAbsorbableNodes(T) // parent/child pairs, cosine(parent, child) >= T
  for (const { parent, child } of pairs) {
    const merged = merge([parent.doc, child.doc])
    await store.update(parent.nodeId, merged)
    for (const grandchild of child.children) {
      await store.setParent(grandchild, parent.nodeId)   // reuse from §1
    }
    await store.del(child.nodeId)                          // reuse from §1
  }
}
```

Why this is the right shape rather than the fancier extraction version:

- It reuses `Merge`, `store.del`, and `store.setParent` as-is — no new LLM-driven "diff two
  documents and extract the common part" primitive needed, which is a much bigger and shakier
  thing to design well in a codebase where most of this is still stubs.
- It's symmetric with merge-on-add: same threshold `T`, same `merge` function, just checked
  across the parent-child edge instead of against the top search hit at write time.
- It composes with `split` for free, without extra logic: if enough children get absorbed that
  the parent's content exceeds `L`, the existing `getSpillableNodes(L)` / split path picks it
  up on the next pass and re-differentiates it. That gives a self-correcting cycle — absorb
  compresses toward generality, split expands toward specificity — that tracks the actual shape
  of the underlying knowledge instead of only ever growing in one direction.
- It directly needs §1's `del`/reparent logic: a child fully absorbed into its parent *is* a
  deletion. The two problems the task asked about aren't independent — solving "how does a node
  get removed" is a prerequisite for solving "how does content rise."

Root nodes have no parent, so they're naturally excluded — no special-casing needed there.

Two things I'd flag as open rather than settle here: whether `getAbsorbableNodes` should run as
a continuous check (like merge-on-add, evaluated whenever a child changes) or a periodic sweep
(like `split`'s maintenance queue) — periodic seems to fit the "background self-maintenance"
framing in the doc better, but continuous would catch drift sooner. And whether whole-document
similarity is too coarse in practice (a child that's 80% novel and 20% redundant with its
parent won't cross `T` and won't get any relief) — that's the case the finer-grained,
per-`Element` extraction would actually solve, but it's worth waiting to see if it's a real
problem before building the more complex machinery for it.
