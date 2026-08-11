# The MemTree Algorithm

MemTree is a knowledge base for humans and AI agents, structured as a tree of documents. Every
node in the tree is a document, and every document carries a semantic embedding.

**Version 1**, described below, is deliberately conservative: it has no notion of deletion at
all, explicit or implicit. Once a node exists it stays in the tree forever — its *content* can
change (merge, split), but the tree never loses a node. Why, and what a later version might do
about it, is discussed in [Open Questions](#open-questions).

## Operations

Anyone interacting with the tree — human or AI agent — can:

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

- **Merge on fan-out** (v1, not yet defined). When a node has more than `D` children, some of its
  children are merged: the number of children is reduced, and whatever made those children
  similar enough to merge is extracted and moves up the tree — for example, by creating a new
  parent node to hold the extracted content, with the merged children reattached beneath it. The
  precise mechanics — how children are grouped for merging, what exactly gets extracted, and how
  new parents get created and attached — aren't defined yet. See
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

Version 1 has no deletion. If a future version adds it, it likely needs two distinct mechanisms
doing different jobs rather than one mechanism trying to do both:

- **Explicit removal** — an agent or human designates a document as wrong or obsolete, and it is
  removed. This is the only mechanism that can act on *correctness*: no amount of usage tracking
  can tell you a fact became false, only something that actually understands the content can.
  Explicit removal should stand alongside add as a first-class operation, available without
  restriction at the algorithm level — the algorithm itself has no concept of users or
  permissions, so deciding *who* is allowed to remove *what* is a concern for whatever layer
  manages identity, not for the tree algorithm.

- **Automatic removal** — driven by neglect rather than correctness, e.g. tracking how long it's
  been since a document was last read and treating documents that go unused long enough as
  candidates for removal. This is a much weaker signal than explicit removal: a document going
  unused doesn't mean it's wrong, and a rarely-needed-but-still-true foundational fact looks
  identical to a rarely-needed-because-obsolete one under a pure recency signal. So an automatic
  mechanism shouldn't be destructive — it should *archive*: drop a stale document out of search
  results while keeping it retrievable and reversible. Permanent removal stays an explicit,
  deliberate act.

Removing a node also raises structural questions independent of *why* it's being removed:

- **What happens to its children?** Cascading the removal — deleting the whole subtree — risks
  throwing away still-valid content underneath a node that was itself invalid. The alternative —
  reattaching the removed node's children to its own parent — keeps that content in the tree, one
  level shallower, but isn't free: an internal node with several children usually represents a
  category that groups them, and removing it while reattaching its children erases that grouping.
  If many children are involved, this can simply relocate the original problem (too many
  children crowded together) one level up instead of resolving it. Reattaching is a clean move
  for a node with a single child, or when the node's own content was wrong but its role as a
  grouping was still sound; it's a poor move when the node's whole cluster of children no longer
  belongs together, in which case the children need to be individually reconsidered rather than
  bulk-promoted.

- **What happens to the root?** A root with no children can simply be removed — the tree becomes
  empty, and the next document added becomes the new root. A root with children can't use the
  same reattachment rule as everywhere else, because there's no grandparent to reattach to;
  reattaching children with no parent produces a forest instead of a tree. Removing a root that
  has children needs either a dedicated rule (e.g. promote one child to be the new root, reattach
  the rest under it) or should simply be disallowed until the tree has been brought down to a
  single child by other means.

Whatever the eventual design, two properties should hold regardless of mechanism:

- Removal has to take effect immediately for search — a document search returns has to actually
  exist to be read, so removal can't be a lazy or eventual operation the way content edits (which
  just mark an embedding stale until it's recomputed) can be.
- Removal has to be safe to run concurrently with the tree's other background maintenance
  (splitting overflowing nodes, merging overflowing fan-out): a node queued for one of those
  operations might be removed before that operation runs, and maintenance has to tolerate that
  rather than assume every node it queued still exists by the time it acts.

### 2. How does information go up the tree?

Search, read, and add, along with merge-on-add and split-on-overflow, only ever push content
downward or sideways: split moves content from a node into new children beneath it; merge-on-add
only ever affects the single node an addition lands on. Nothing currently takes content that has
accumulated across several children and folds the shared part back into their parent — the
inverse of what split does. Without that, the tree can only ever grow more specific over time,
and as the underlying knowledge matures, similar content will simply keep piling up across
siblings instead of consolidating.

The general version of this is a content-extraction problem: given several children whose
content partially overlaps, extract the common part into the parent (or into a newly created
intermediate parent) and leave each child with just what's left over. Doing this precisely
requires comparing children below the level of a whole document — at the level of individual
passages or statements — which in turn requires a way to locate *where* two documents overlap,
not just measure how similar they are as wholes.

A coarser version only needs whole-document similarity: whenever a child's content, taken as a
whole, is similar enough to its parent's, treat the child as no longer saying anything the parent
doesn't already cover, and fold it entirely into the parent — merge its content into the
parent's, move its own children up to attach directly to the parent, and remove it. This reuses
the same similarity threshold and merge behavior that already governs merge-on-add, just
evaluated across a parent-child pair instead of at write time, and it composes naturally with
split: if enough absorbed content pushes the parent over the length limit, the existing split
behavior re-differentiates it — so the tree can compress toward generality and expand toward
specificity as the knowledge underneath it changes, rather than only ever growing in one
direction.

This coarser version also only ever removes a node by fully absorbing it, which is exactly the
deletion problem from Open Question 1 — the two open questions aren't independent, and an answer
to "how does a node get removed" is a prerequisite for "how does content rise." It's also why
merge-on-fan-out can't be considered settled yet: reducing a node's number of children means
removing or restructuring some of them, and moving information *up* (rather than merely combining
siblings into each other) means the tree needs a way to create new intermediate nodes to hold
whatever gets extracted — neither of which has a defined mechanism yet.

Left open even within the coarser approach: whether this check should run continuously
(evaluated whenever a child changes, the way merge-on-add is) or as a periodic background sweep
(the way split's maintenance pass is); and whether whole-document similarity is too coarse in
practice — a child that's mostly novel but partly redundant with its parent won't cross the
threshold and won't get any relief, which is exactly the case finer-grained extraction would
solve, but is worth deferring until it's shown to be a real problem.
