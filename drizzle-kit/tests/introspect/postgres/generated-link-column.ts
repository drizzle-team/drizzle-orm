import { pgTable, integer, text, pgSequence } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const usersIdSeq = pgSequence("users_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })

export const users = pgTable("users", {
	id: integer().generatedAlwaysAsIdentity({ name: "undefined", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647 }),
	email: text(),
	generatedEmail: text().default(email).generatedAlwaysAs(sql`email`),
});
