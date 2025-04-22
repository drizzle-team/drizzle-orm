import { pgTable, integer, pgRole, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const userRole = pgRole("user_role",  {  inherit: false 	});


export const users = pgTable("users", {
	id: integer().primaryKey(),
}, (table) => [
	pgPolicy("newRls", { to: ["postgres", userRole], }),
	pgPolicy("test", { using: sql`true`, withCheck: sql`true` }),
]).enableRLS();
