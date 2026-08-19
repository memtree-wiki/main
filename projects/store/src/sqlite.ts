import { Database } from "bun:sqlite"
import type { Generated, Kysely as KyselyType } from "kysely"
import * as sqliteVec from "sqlite-vec"
import { type store } from "."

interface TopicRow {
  topic_id: Generated<number>
  title: string
}

interface MsgRow {
  msg_id: Generated<number>
  date: string
  speaker: string
  text: string
}

interface MsgsRow {
  topic_id: number
  msg_id: number
}

// JSON-encoded store.Vector
interface VecTopicRow {
  topic_id: number
  embedding: string
}

interface Schema {
  topic: TopicRow
  msg: MsgRow
  msgs: MsgsRow
  vec_topic: VecTopicRow
}

async function createSchema(db: KyselyType<Schema>): Promise<void> {
  await db.schema
    .createTable("topic")
    .ifNotExists()
    .addColumn("topic_id", "integer", (col) => col.primaryKey())
    .addColumn("title", "text", (col) => col.notNull().unique())
    .execute()

  await db.schema
    .createTable("msg")
    .ifNotExists()
    .addColumn("msg_id", "integer", (col) => col.primaryKey())
    .addColumn("date", "text", (col) => col.notNull())
    .addColumn("speaker", "text", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .execute()

  await db.schema
    .createTable("msgs")
    .ifNotExists()
    .addColumn("topic_id", "integer", (col) => col.notNull().references("topic.topic_id"))
    .addColumn("msg_id", "integer", (col) => col.notNull().references("msg.msg_id"))
    .addPrimaryKeyConstraint("msgs_pk", ["topic_id", "msg_id"])
    .execute()
}

export default async function sqliteStore(path = ":memory:"): Promise<store.Store> {
  // Dynamic imports avoid an intermittent kysely/kysely-bun-sqlite CJS/ESM load-order race
  // (same workaround projects/eval/ingest.ts and analyze.ts use).
  const { Kysely, sql } = await import("kysely")
  const { BunSqliteDialect } = await import("kysely-bun-sqlite")

  const sqlite = new Database(path)
  sqliteVec.load(sqlite)

  // sqlite-vec@0.1.9's vec0 does exact brute-force KNN (no ANN/HNSW/IVF index) -- fine at this
  // corpus scale. CREATE VIRTUAL TABLE isn't expressible via Kysely's schema builder, so it's
  // issued directly on the raw bun:sqlite handle. distance_metric=cosine is declared explicitly
  // so `score = 1 - distance` is always a direct cosine similarity, regardless of whether every
  // future embedding stays L2-normalized.
  sqlite.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_topic USING vec0(
      topic_id INTEGER PRIMARY KEY,
      embedding FLOAT[384] distance_metric=cosine
    )
  `)

  const db = new Kysely<Schema>({ dialect: new BunSqliteDialect({ database: sqlite }) })
  await createSchema(db)

  async function ingest({ topics, msgs, edges }: store.Ingest): Promise<void> {
    await db.transaction().execute(async (trx) => {
      const msgRows = msgs.length
        ? await trx
          .insertInto("msg")
          .values(msgs.map((msg) => ({ date: msg.date.toISOString(), speaker: msg.speaker, text: msg.text })))
          .returning("msg_id")
          .execute()
        : []

      const topicIds: number[] = []
      for (const topic of topics) {
        const row = await trx
          .insertInto("topic")
          .values({ title: topic.title })
          .onConflict((oc) => oc.column("title").doUpdateSet({ title: topic.title }))
          .returning("topic_id")
          .executeTakeFirstOrThrow()

        // Delete-then-insert rather than relying on vec0 supporting ON CONFLICT (uncertain for
        // virtual tables) -- unconditionally safe whether this topic_id is new or reused.
        await trx.deleteFrom("vec_topic").where("topic_id", "=", row.topic_id).execute()
        await trx.insertInto("vec_topic").values({ topic_id: row.topic_id, embedding: JSON.stringify(topic.embedding) }).execute()

        topicIds.push(row.topic_id)
      }

      const links: MsgsRow[] = []
      for (const [topicIdx, msgIdxs] of edges) {
        const topicId = topicIds[topicIdx]
        if (topicId === undefined) throw new Error(`ingest: edges references out-of-range topic index ${topicIdx}`)
        for (const msgIdx of msgIdxs) {
          const msgId = msgRows[msgIdx]?.msg_id
          if (msgId === undefined) throw new Error(`ingest: edges references out-of-range msg index ${msgIdx}`)
          links.push({ topic_id: topicId, msg_id: msgId })
        }
      }
      if (links.length) {
        await trx
          .insertInto("msgs")
          .values(links)
          .onConflict((oc) => oc.doNothing())
          .execute()
      }
    })
  }

  async function search({ vector, minSimilarity = 0 }: store.Search): Promise<store.SearchResult[]> {
    const { count } = await db
      .selectFrom("vec_topic")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow()
    if (count === 0) return []

    // vec0 KNN requires an explicit k on the MATCH constraint, so fetch every row (k = total
    // count) and filter by minSimilarity ourselves rather than relying on the topK cutoff.
    const { rows } = await sql<{ topic_id: number; title: string; distance: number }>`
      SELECT t.topic_id AS topic_id, t.title AS title, v.distance AS distance
      FROM vec_topic v
      JOIN topic t ON t.topic_id = v.topic_id
      WHERE v.embedding MATCH ${JSON.stringify(vector)} AND k = ${count}
      ORDER BY v.distance
    `.execute(db)

    return rows
      .map((row) => ({ topic_id: row.topic_id, title: row.title, score: 1 - row.distance }))
      .filter((row) => row.score >= minSimilarity)
  }

  async function msgs(topic_ids: number[]): Promise<store.Msg[]> {
    if (topic_ids.length === 0) return []

    // distinct() -- a msg linked to more than one of the requested topics would otherwise
    // appear once per link.
    const rows = await db
      .selectFrom("msgs")
      .innerJoin("msg", "msg.msg_id", "msgs.msg_id")
      .select(["msg.date", "msg.speaker", "msg.text"])
      .distinct()
      .where("msgs.topic_id", "in", topic_ids)
      .orderBy("msg.date")
      .execute()

    return rows.map((row) => ({ date: new Date(row.date), speaker: row.speaker, text: row.text }))
  }

  return { ingest, search, msgs }
}
