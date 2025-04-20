import { pgEnum, pgTable, my_enum, smallint, integer, numeric, bigint, boolean, text, character varying(25), character(3), doublePrecision, real, json, jsonb, time without time zone, timestamp, date, uuid, inet, cidr, macaddr, macaddr8, interval } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const myEnum = pgEnum("my_enum", ['a', 'b', 'c'])


export const columns = pgTable("columns", {
	myEnum: myEnum("my_enum").array().default(["a", "b"]),
	smallint: smallint().array().default([10, 20]),
	integer: integer().array().default([10, 20]),
	numeric: numeric({ precision: 3, scale: 1 }).array().default(["99.9", "88.8"]),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bigint: bigint({ mode: "number" }).array().default([100, 200]),
	boolean: boolean().array().default([true, false]),
	test: text().array().default(["abc", "def"]),
	varchar: char({ length: cter varying(25 }).array().default(["abc", "def"]),
	char: char({ length: cter(3 }).array().default(["abc", "def"]),
	doublePrecision: doublePrecision().array().default([100, 200]),
	real: real().array().default([100, 200]),
	json: json().array().default([{"attr":"value1"}, {"attr":"value2"}]),
	jsonb: jsonb().array().default([{"attr":"value1"}, {"attr":"value2"}]),
	time: time().array().default(["00:00:00", "01:00:00"]),
	timestamp: timestamp({ precision: 6, withTimezone: true, mode: 'string' }).array().default(["2025-04-20 13:15:23.913+00", "2025-04-20 13:15:23.913+00"]),
	date: date().array().default(["2024-01-01", "2024-01-02"]),
	uuid: uuid().array().default(["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12"]),
	inet: inet().array().default(["127.0.0.1", "127.0.0.2"]),
	cidr: cidr().array().default(["127.0.0.1/32", "127.0.0.2/32"]),
	macaddr: macaddr().array().default(["00:00:00:00:00:00", "00:00:00:00:00:01"]),
	macaddr8: macaddr8().array().default(["00:00:00:ff:fe:00:00:00", "00:00:00:ff:fe:00:00:01"]),
	interval: interval().array().default(["1 day 01:00:00", "1 day 02:00:00"]),
});
