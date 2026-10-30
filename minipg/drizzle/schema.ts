import { pgTable, serial, text, bigint, numeric, boolean, jsonb, integer, doublePrecision, timestamp, customType } from "drizzle-orm/pg-core"

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" })
import { sql } from "drizzle-orm"



export const t = pgTable("t", {
	id: serial().primaryKey().notNull(),
	name: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	n8: bigint({ mode: "number" }),
	amount: numeric(),
	ok: boolean(),
	data: jsonb(),
	blob: bytea("blob"),
});

export const pulsePlayground = pgTable("pulse_playground", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "pulse_playground_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: text(),
	qty: integer(),
	price: doublePrecision(),
	tags: jsonb(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});
