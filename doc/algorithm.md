# The MemTree Algorithm

MemTree is a knowledge base for humans and AI agents, structured as a flat pool of documents.
There is no tree, no parent, no children — just a set of documents, each carrying a semantic
embedding.

**Version 1**, described below, is deliberately conservative: it has no notion of deletion at
all, explicit or implicit. Once a document exists it stays in the pool forever — its *content* can
change (merge, split), but the pool never loses a document. Why, and what a later version might do
about it, is discussed in [Open Questions](#open-questions).

## Operations

Anyone interacting with the pool — human or AI agent — can:

- **search** the pool — find documents relevant to a query via semantic similarity.
- **read** a specific document.
- **add** a new document to the pool.

There is no **delete**/**remove** operation in v1 — see
[Open Question 1](#1-how-does-information-get-deleted-if-at-all).

## Parameters

The algorithm is governed by two parameters:

- **L** — max document length (text length).
- **R** — merge radius: the cosine-similarity threshold for merging; a new document merges with an
  existing one when their embeddings are at least `R` similar.

There is no equivalent of a max out-degree or branching-factor parameter — there's no hierarchy to
bound.

## Self-maintenance

The pool maintains itself in the background as documents are added, so that no document exceeds
`L`:

- **Merge on add** (v1). When a new document is added, it is merged with *every* existing document
  within radius `R` of it — not just the closest one — into a single document. This never removes
  information: an add either becomes a brand-new document or is absorbed into (and absorbs) one or
  more existing documents, so total content only ever grows or stays flat. This is the pool's only
  consolidation mechanism, and it does double duty: it's both how new information gets added *and*
  how existing, overlapping information gets folded together, since a merge can pull in more than
  one previously separate document at once.

- **Split on overflow** (v1). When a (merged) document's length exceeds `L`, it is split into
  multiple documents, each ideally below `L`. Unlike merge, split's outputs are independent
  documents in the pool afterward — there's no summary document left behind holding them together,
  only whatever similarity remains between their embeddings.

Any operation that changes a document's content (add, merge, or split) invalidates its embedding,
which must be recomputed before the document is searchable again — a memory layer whose retrieval
relies on stale embeddings fails silently rather than loudly.

Two mechanics are still unsettled and covered under Open Questions rather than treated as settled
design: how merge-on-add avoids chaining into runaway clusters as more documents land nearby over
time ([Open Question 2](#2-how-is-chaining-and-order-dependence-bounded)), and how split avoids
immediately being undone by merge re-absorbing its own output
([Open Question 3](#3-how-is-mergesplit-oscillation-avoided)).

## Advantages

- MemTree is optimized both for human and AI consumption. It is token efficient, and it is
  structured to facilitate semantic search and retrieval.
- MemTree can be used as an always up-to-date knowledge wiki for humans and AI agents.
- Redundancy consolidation is built into the same rule that handles ordinary adds — a document
  whose content overlaps with several existing documents merges with all of them in one step,
  rather than needing a separate mechanism to notice and fold overlapping content together after
  the fact.
- Deletion, once designed, is structurally simple: a document is a standalone unit with nothing
  else in the pool referencing it, so removing one doesn't raise any of the reattachment or
  special-casing questions a hierarchy would.
- Fewer parameters and fewer rules than a hierarchical design: two parameters (`L`, `R`) and two
  self-maintenance rules (merge on add, split on overflow), with no fan-out bound to maintain.

The cost of this simplicity is that a flat pool has no structure to browse — every document stands
alone, and the only way in is a query. See [Future Work](#future-work) for how links could recover
that without reintroducing a rigid hierarchy.

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
  manages identity, not for the pool algorithm.

- **Automatic removal** — driven by neglect rather than correctness, e.g. tracking how long it's
  been since a document was last read and treating documents that go unused long enough as
  candidates for removal. This is a much weaker signal than explicit removal: a document going
  unused doesn't mean it's wrong, and a rarely-needed-but-still-true foundational fact looks
  identical to a rarely-needed-because-obsolete one under a pure recency signal. So an automatic
  mechanism shouldn't be destructive — it should *archive*: drop a stale document out of search
  results while keeping it retrievable and reversible. Permanent removal stays an explicit,
  deliberate act.

Unlike a tree, removing a document from a flat pool raises no structural questions of its own —
there are no children to reattach and no root to special-case, since nothing in the pool holds a
structural reference to anything else. (If [links](#future-work) are added later, removal will
need to account for them — see that section.)

Whatever the eventual design, two properties should hold regardless of mechanism:

- Removal has to take effect immediately for search — a document search returns has to actually
  exist to be read, so removal can't be a lazy or eventual operation the way content edits (which
  just mark an embedding stale until it's recomputed) can be.
- Removal has to be safe to run concurrently with the pool's other background maintenance
  (merging, splitting): a document queued for one of those operations might be removed before that
  operation runs, and maintenance has to tolerate that rather than assume every document it queued
  still exists by the time it acts.

### 2. How is chaining and order-dependence bounded?

Merging "with every document in a given radius" as a single step is a form of single-linkage
clustering, and single-linkage is known for chaining: if A merges with B, and later C arrives close
enough to the merged A+B, C joins too — even if C was never within `R` of A itself. Over time, a
cluster's effective radius can drift well past `R` from the perspective of its earliest members,
purely as an artifact of the order documents happened to arrive in. Options worth exploring: cap
how much a single merge step can pull in at once, re-validate radius against the *original*
members rather than the running merged embedding, or split preemptively rather than waiting for
`L` to be exceeded when a merge looks like it's chaining. None of these are decided yet.

### 3. How is merge/split oscillation avoided?

A document produced by splitting an overflowing merged document is, almost by construction, still
highly similar to its siblings from the same split — they're fragments of what was, moments ago,
one coherent document. If a later add (or a periodic resweep) re-evaluates those fragments against
each other, they may re-cross radius `R`, merge right back together, overflow `L`, and split again.
Avoiding this needs either split boundaries chosen deliberately so the outputs land below `R` from
each other, or a cooldown that excludes freshly-split siblings from re-merging with one another for
some period. Neither is defined yet.

## Future Work

### Making the pool browsable: links between documents

A flat pool's biggest weakness against a hierarchical design is navigability: there's no path to
walk, no way to orient without already knowing what to search for — a real gap for something
framed as a *wiki* rather than pure retrieval backend. The intent is to close that gap not by
reintroducing a rigid tree, but by letting documents **link** to each other, the way wiki articles
do.

Roughly:

- When a document is added or merged, in addition to the merge-radius check against `R`, compare
  it against other documents at a second, lower similarity band — related enough to be relevant,
  not similar enough to merge — and record a link between them.
- Links let search results surface "see also" documents beyond the top-matching set, and let
  reading one document surface what points to and from it (backlinks), giving the browsing
  experience a hierarchy-like path without committing every document to exactly one place in a
  hierarchy — a document can link to several others across what would have been unrelated branches
  of a tree.
- Links could also be authored explicitly — by a human, or by an agent that has just read two
  documents and recognizes a connection a similarity score alone wouldn't surface (e.g. a causal or
  chronological relationship rather than a topical one).

Open sub-questions this needs to work through before it's a real design: whether links are directed
or undirected; whether they carry a type (e.g. "related", "see also", "supersedes") or are
uniform; how many links a document should accumulate before they stop being useful signal; how
links get invalidated or re-evaluated as the documents on either end keep changing under merge and
split; and what removal means once a deleted document has other documents linking to it.
