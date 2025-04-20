import { pgSchema, pgEnum, pgTable, schema2.my_enum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const schema2 = pgSchema("schema2");
export const myEnumInSchema2 = schema2.enum("my_enum", ['a', 'b', 'c'])


export const users = pgTable("users", {
	// TODO: failed to parse database type 'schema2.my_enum'
	col: unknown("col"),
});
