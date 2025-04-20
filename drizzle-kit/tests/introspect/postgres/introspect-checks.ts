import { pgTable, integer, character varying, check, pgSequence } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const usersIdSeq = pgSequence("users_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })

export const users = pgTable("users", {
	id: integer().default(sql`nextval('users_id_seq'::regclass)`).notNull(),
	name: char({ length: cter varyin }),
	age: integer(),
}, (table) => {
	return {
		someCheck: check("some_check", sql`CHECK ((age > 21))`),
	}
});
