import { sqliteTable, AnySQLiteColumn, integer, sqliteView } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const users = sqliteTable("users", {
	id: integer(),
});

export const someView = sqliteView("some_view", {
	id: integer(),
}).as(sql`SELECT * FROM "users"`);