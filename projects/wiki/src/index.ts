import { type Document } from "@memtree.wiki/docs"
import PQueue from "p-queue"

type Vector = readonly number[]

type Embed = (doc: Document) => Promise<Vector>
type Merge = (docs: [Document, Document]) => Document
type Split = (doc: Document) => {
  parent: Document
  children: Document[]
}

function cosineSimilarity(a: Vector, b: Vector): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
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
  del: (nodeId: nodeId) => Promise<void>
  get: (nodeId: nodeId) => Promise<Node>
  setParent: (child: nodeId, parent: nodeId | null) => Promise<void>
  // 
  getSpillableNodes: (L: number) => Promise<Node[]>
}

interface Params {
  L: number
  D: number
  T: number

  embed: Embed
  merge: Merge
  split: Split

  store: Store

  splitConcurrency?: number
}

export type API = ReturnType<typeof memTree>

export function memTree({ L, D, T, embed, merge, split, store, splitConcurrency }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
    topK?: number
  }

  async function search({ query, topK }: SearchParams) {
    const vector = await embed({ title: "", about: query, content: [] })
    return store.search(vector, topK)
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
    const results = await store.search(vector, 1)
    const best = results[0]

    if (best && best.score >= T) {
      const merged = merge([best.node.doc, doc])
      await store.update(best.node.nodeId, merged)
      return best.node.nodeId
    }

    return store.add(doc, null)
  }

  // MAINTENANCE
  const qSplit = new PQueue({ concurrency: splitConcurrency ?? 1 })

  return {
    search,
    read,
    add,
    // 
    split: async () => {
      const ns = await store.getSpillableNodes(L)
      qSplit.addAll(ns.map(n => async () => {
        const { parent, children } = split(n.doc)
        await store.update(n.nodeId, parent)
        for (const child of children) {
          await store.add(child, n.nodeId)
        }
      }))
      await qSplit.onIdle()
    }
  }
}
