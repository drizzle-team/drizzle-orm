import { customType, pgTable } from 'drizzle-orm/pg-core';

// Define custom column types
const myInteger = customType<{ data: number; driverData: number }>({
	dataType() {
		return 'integer';
	},
});

const myText = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
});

const myBoolean = customType<{ data: boolean; driverData: boolean }>({
	dataType() {
		return 'boolean';
	},
});

const myTimestamp = customType<{ data: Date; driverData: string }>({
	dataType() {
		return 'timestamp';
	},
	fromDriver(value: string) {
		return new Date(value);
	},
});

// Create table with custom columns
const users = pgTable('users', {
	id: myInteger().notNull().primaryKey(),
	name: myText().notNull(),
	email: myText().notNull(),
	active: myBoolean().default(true),
	createdAt: myTimestamp().defaultNow(),
});

export type UsersTable = typeof users;
