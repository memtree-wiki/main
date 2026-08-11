import { type Document } from "@memtree.wiki/docs"
import PQueue from "p-queue"

type Vector = readonly number[]

type Embed = (text: string, asQuery: boolean) => Promise<Vector>
// Docs are ordered by creation time, newer docs are last in the array.
type Merge = (docs: Document[]) => Promise<Document>
type Split = (doc: Document) => Promise<Document[]>

type nodeId = number

interface Node {
  nodeId: nodeId
  created: Date
  doc: Document
}

interface SearchResult {
  node: Node
  score: number
}

interface Store {
  search(vector: Vector, topK?: number): Promise<SearchResult[]>

  add(doc: Document): Promise<nodeId>
  del(nodeId: nodeId): Promise<void>
  get(nodeId: nodeId): Promise<Node>

  getNeighbors(vector: Vector, radius: number): Promise<Node[]>
  getSplittable(L: number): Promise<Node[]>
}

interface Params {
  mergeRadius: number
  maxDocLength: number

  embed: Embed
  merge: Merge
  split: Split

  store: Store

  splitConcurrency?: number
}

export type API = ReturnType<typeof memTree>

export function memTree({ mergeRadius, maxDocLength, embed, merge, split, store, splitConcurrency }: Params) {
  // SEARCH
  interface SearchParams {
    query: string
    topK?: number
  }

  async function search({ query, topK }: SearchParams) {
    const vector = await embed(query, true)
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
    const vector = await embed(doc.about, false)
    const neighbors = await store.getNeighbors(vector, mergeRadius)

    if (neighbors.length === 0) {
      return store.add(doc)
    }

    const docs = [...neighbors]
      .sort((a, b) => a.created.getTime() - b.created.getTime())
      .map(({ doc }) => doc)

    const merged = await merge([...docs, doc])
    const id = await store.add(merged)
    await Promise.all(neighbors.map(({ nodeId }) => store.del(nodeId)))
    return id
  }

  // MAINTENANCE
  const qSplit = new PQueue({ concurrency: splitConcurrency ?? 1 })

  return {
    search,
    read,
    add,
    // 
    split: async () => {
      const ns = await store.getSplittable(maxDocLength)
      qSplit.addAll(ns.map(({ doc, nodeId }) => async () => {
        for (const child of await split(doc)) {
          await store.add(child)
        }
        await store.del(nodeId)
      }))

      await qSplit.onIdle()
    }
  }
}
