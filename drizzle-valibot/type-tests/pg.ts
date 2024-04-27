import { char, date, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { Output } from 'valibot';
import { createInsertSchema, createSelectSchema } from '../src';
import { type Equal, Expect } from './utils';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const testTable = pgTable('users', {
	intArr: integer('int_arr').array(),
	strArr: text('str_arr').array(),
	id: serial('id').primaryKey(),
	name: text('name'),
	email: text('email').notNull(),
	birthdayString: date('birthday_string').notNull(),
	birthdayDate: date('birthday_date', { mode: 'date' }).notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	role: roleEnum('role').notNull(),
	roleText: text('role1', { enum: ['admin', 'user'] }).notNull(),
	roleText2: text('role2', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	profession: varchar('profession', { length: 20 }).notNull(),
	initials: char('initials', { length: 2 }).notNull(),
});

const insertSchema = createInsertSchema(testTable);
const selectSchema = createSelectSchema(testTable);

type InsertType = Output<typeof insertSchema>;
type SelectType = Output<typeof selectSchema>;

Expect<
	Equal<InsertType, {
		role: 'admin' | 'user';
		email: string;
		birthdayString: string;
		birthdayDate: Date;
		roleText: 'admin' | 'user';
		profession: string;
		initials: string;
		intArr?: number[] | null;
		strArr?: string[] | null;
		id?: number;
		name?: string | null;
		createdAt?: Date;
		roleText2?: 'admin' | 'user';
	}>
>;

Expect<
	Equal<SelectType, {
		role: 'admin' | 'user';
		intArr: number[] | null;
		strArr: string[] | null;
		id: number;
		name: string | null;
		email: string;
		birthdayString: string;
		birthdayDate: Date;
		createdAt: Date;
		roleText: 'admin' | 'user';
		roleText2: 'admin' | 'user';
		profession: string;
		initials: string;
	}>
>;
