# The MemTree Algorithm

MemTree is a knowledge base for humans and AI agents, structured as a tree of documents (see
`Document` in `@memtree.wiki/docs`). Every node in the tree is a document, and every document
carries a semantic embedding.

## Agent operations

An AI agent interacting with the tree can:

- **search** the tree — find documents relevant to a query via semantic similarity.
- **read** a specific document.
- **add** a new document to the tree.
- **edit** an existing document's content.
- **delete** a subtree from the tree.

## Parameters

The algorithm is governed by two parameters:

- **L** — max document length (text length).
- **D** — max out-degree (number of children per node).

## Self-maintenance

The tree maintains its own shape in the background as documents are added and edited, so that no
document exceeds `L` and no node exceeds `D` children:

- **Merge on add.** When a new document is added, if it is semantically similar enough to an
  existing document, it is merged into that document instead of being inserted as a new node.
- **Split on overflow.** When a document's length exceeds `L`, it is split into a parent document
  and child documents. The original document's existing children are reattached under the new
  parent. Ideally the split yields documents with length below `L / 2`.
- **Cluster on fan-out.** When a document has more than `D` children, its children are clustered
  and merged down into at most `D / 2` documents.

Any operation that changes a document's content (add, edit, merge, or split) invalidates its
embedding, which must be recomputed before the document is searchable again — a memory layer
whose retrieval relies on stale embeddings fails silently rather than loudly.


## Advantages
- MemTree is optimized both for human and AI consumption. It is token efficient, and it is structured to facilitate semantic search and retrieval.
- MemTree can be used as an always up-to-date knowledge wiki for humans and AI agents.