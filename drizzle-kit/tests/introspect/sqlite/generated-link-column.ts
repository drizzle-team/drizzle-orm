import { sqliteTable, AnySQLiteColumn, integer, text } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const users = sqliteTable("users", {
	id: integer("id"),
	email: text("email"),
	generatedEmail: text("generatedEmail").generatedAlwaysAs(sql`(\`email\``, { mode: "virtual" }),
});