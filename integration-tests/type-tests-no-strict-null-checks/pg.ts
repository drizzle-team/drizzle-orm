// oxlint-disable no-unused-expressions
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { type Equal, Expect } from './utils.ts';

export const test = pgTable(
	'test',
	{
		id: text('id')
			.primaryKey()
			.generatedAlwaysAs(sql`'genstr'`),
		intId: integer('int_id')
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		int2Id: integer('int2_id').generatedByDefaultAsIdentity(),
		name: text('name').$defaultFn(() => '' as string),
		title: text('title').notNull(),
		description: text('description'),
		dbdef: text('dbdef').default('dbdefval'),
	},
);

Expect<
	Equal<typeof test['$inferSelect'], {
		id: string;
		intId: number;
		int2Id: number;
		name: string;
		title: string;
		description: string;
		dbdef: string;
	}>
>;

Expect<
	Equal<typeof test['$inferInsert'], {
		title: string;
		int2Id?: number;
		name?: string;
		description?: string;
		dbdef?: string;
	}>
>;

const db = drizzle.mock();

db.update(test)
	.set({
		// @ts-expect-error
		id: '1',
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		// @ts-expect-error
		intId: 1,
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		int2Id: 1,
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.insert(test).values({
	// @ts-expect-error
	id: '1',
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	// @ts-expect-error
	intId: 1,
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	int2Id: 1,
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	title: 'title',
	description: 'desc',
});

db.insert(test).values({
	title: 'title',
});

// Dialect-agnostic test - do not duplicate
{
	const res = await db.select({
		preNull: sql<number | null>`somequery`.mapWith((v) => {
			Expect<Equal<typeof v, number>>;
			return String(v);
		}).as('sq1'),
		postNull: sql<number>`somequery`.mapWith((v) => {
			Expect<Equal<typeof v, number>>;
			return String(v);
		}).nullable().as('sq2'),
		prePostNull: sql<number | null>`somequery`.mapWith((v) => {
			Expect<Equal<typeof v, number>>;
			return String(v);
		}).nullable().as('sq3'),
		default: sql`somequery`.mapWith((v) => {
			Expect<Equal<typeof v, unknown>>;
			return String(v);
		}).as('sq4'),
		unknown: sql<unknown>`somequery`.mapWith((v) => {
			Expect<Equal<typeof v, unknown>>;
			return String(v);
		}).as('sq5'),
		any: sql<any>`somequery`.mapWith((v) => {
			Expect<Equal<typeof v, any>>;
			return String(v);
		}).as('sq6'),
	}).from(test);

	Expect<
		Equal<typeof res, {
			preNull: string | null;
			postNull: string | null;
			prePostNull: string | null;
			default: string;
			unknown: string;
			any: string;
		}[]>
	>;
}
