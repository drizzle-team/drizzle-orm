import { pgEnum, pgTable, my_enum, text, character varying } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const myEnum = pgEnum("my_enum", ['escape\'s quotes " '])


export const columns = pgTable("columns", {
	myEnum: myEnum("my_enum").default('escape\'s quotes " ',
	text: text().default('escape\'s quotes " '),
	varchar: char({ length: cter varyin }).default('escape\'s quotes " '),
});
