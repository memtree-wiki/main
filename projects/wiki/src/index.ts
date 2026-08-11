import { md, type Document } from "@memtree.wiki/docs"

type Vector = readonly number[]

type Embed = (doc: Document) => Promise<Vector>
type Merge = (docs: [Document, Document]) => Document
type Split = (doc: Document) => {
  parent: Document
  children: Document[]
}

type nodeId = number

interface Node {
  nodeId: nodeId
  created: Date
  parent: nodeId | null
  children: nodeId[]
  doc: Document
}

interface SearchResult {
  node: Node
  score: number
}

interface Store {
  search: (vector: Vector, topK?: number) => Promise<SearchResult[]>
  add: (doc: Document, parent: nodeId | null) => Promise<nodeId>
  update: (nodeId: nodeId, doc: Document) => Promise<void>
  del: (subtree: nodeId) => Promise<void>
  get: (nodeId: nodeId) => Promise<Node>
}

interface Params {
  L: number
  D: number
  T: number

  embed: Embed
  merge: Merge
  split: Split
  clust: (docs: Document[]) => Promise<Document[]>

  store: Store
}

export type API = ReturnType<typeof memTree>

export function memTree({ L, D, T, embed, merge, split, clust, store }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
  }

  async function search({ query }: SearchParams) {
    const vector = await embed({ title: "", about: query, content: [] })
    return store.search(vector)
  }

  // READ
  interface ReadParams {
    docId: nodeId
  }

  function read({ docId }: ReadParams) {
    return store.get(docId)
  }

  // ADD
  interface AddParams {
    doc: Document
  }

  async function add({ doc }: AddParams) {
    const vector = await embed(doc)
    const results = await store.search(vector)
    const best = results[0]

    if (best && best.score >= T) {
      const merged = merge([best.node.doc, doc])
      await store.update(best.node.nodeId, merged)
      await maintainSize(best.node.nodeId)
      return best.node.nodeId
    }

    const parent = best?.node.nodeId ?? null
    const id = await store.add(doc, parent)
    await maintainSize(id)
    if (parent !== null) await maintainFanOut(parent)
    return id
  }

  async function maintainSize(id: nodeId): Promise<void> {
    const node = await store.get(id)
    if (md(node.doc).length <= L) return

    const { parent, children } = split(node.doc)
    await store.update(id, parent)
    for (const child of children) {
      await store.add(child, id)
    }
    await maintainFanOut(id)
  }

  async function maintainFanOut(id: nodeId): Promise<void> {
    const node = await store.get(id)
    if (node.children.length <= D) return

    const children = await Promise.all(node.children.map((childId) => store.get(childId)))
    const clustered = await clust(children.map((child) => child.doc))

    // clust folds children's content into fewer documents without saying which
    // originals contributed to which result, so the old children's subtrees can't
    // be selectively preserved — they're discarded wholesale in favor of the merged set.
    for (const child of children) {
      await store.del(child.nodeId)
    }
    for (const doc of clustered) {
      const childId = await store.add(doc, id)
      await maintainSize(childId)
    }
  }

  // DELETE
  interface DelParams {
    subtreeId: nodeId
  }

  function del({ subtreeId }: DelParams) {
    return store.del(subtreeId)
  }

  return { search, read, add, del }
}