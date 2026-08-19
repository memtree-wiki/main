import { Database } from "bun:sqlite"
import { Kysely, type Generated, type Insertable } from "kysely"
import { BunSqliteDialect } from "kysely-bun-sqlite"

export { default as createStore } from "./sqlite"

export namespace store {
  export type Msg = Insertable<TableMsg>
  interface TableMsg {
    msg_id: Generated<number>
    date: Date
    speaker: string
    text: string
  }

  interface Tag {
    tag_id: Generated<number>
    name: string
  }

  interface Tags {
    msg_id: number
    tag_id: number
  }

  export interface Store {
    msg: TableMsg
    tag: Tag
    tags: Tags
  }

  async function init(db: Kysely<Store>) {
    await db.schema
      .createTable("msg")
      .ifNotExists()
      .addColumn("msg_id", "integer", (col) => col.primaryKey())
      .addColumn("date", "text", (col) => col.notNull())
      .addColumn("speaker", "text", (col) => col.notNull())
      .addColumn("text", "text", (col) => col.notNull())
      .execute()

    await db.schema
      .createTable("tag")
      .ifNotExists()
      .addColumn("tag_id", "integer", (col) => col.primaryKey())
      .addColumn("name", "text", (col) => col.notNull().unique())
      .execute()

    await db.schema
      .createTable("tags")
      .ifNotExists()
      .addColumn("msg_id", "integer", (col) => col.notNull().references("msg.msg_id"))
      .addColumn("tag_id", "integer", (col) => col.notNull().references("tag.tag_id"))
      .addPrimaryKeyConstraint("tags_pk", ["msg_id", "tag_id"])
      .execute()

    return db
  }

  export async function sqlite(path = ":memory:") {
    const db = new Kysely<Store>({ dialect: new BunSqliteDialect({ database: new Database(path) }) })
    return await init(db)
  }
}

