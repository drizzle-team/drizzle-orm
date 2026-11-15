import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from '~/better-sqlite3';
import { asc, desc, eq, lte, sql } from '~/sql';
import { integer, sqliteTable, text, union } from '~/sqlite-core';

const records = sqliteTable('records', {
	id: integer().primaryKey(),
	firstName: text().notNull(),
	active: integer().notNull(),
});
const copied = sqliteTable('copied', {
	id: integer().primaryKey(),
	firstName: text().notNull(),
	active: integer().notNull(),
});

describe('SQLite query composition', () => {
	let client: Database.Database;
	let db: ReturnType<typeof drizzle>;

	beforeEach(() => {
		client = new Database(':memory:');
		db = drizzle(client, { casing: 'snake_case' });
		client.exec(`
			create table records (id integer primary key, first_name text not null, active integer not null);
			create table copied (id integer primary key, first_name text not null, active integer not null);
			insert into records values (1, 'd', 1), (2, 'c', 1), (3, 'b', 1), (4, 'a', 1);
		`);
	});

	afterEach(() => {
		client.close();
	});

	it.each([undefined, -1])('selects with offset and limit %s', (limit) => {
		const query = db.select({ id: records.id }).from(records).orderBy(records.id).offset(2);
		if (limit !== undefined) query.limit(limit);
		expect(query.all()).toEqual([{ id: 3 }, { id: 4 }]);
	});

	it('binds an offset without a limit, including zero', () => {
		const query = db.select({ id: records.id }).from(records).orderBy(records.id)
			.offset(sql.placeholder('offset')).prepare();
		expect(query.all({ offset: 2 })).toEqual([{ id: 3 }, { id: 4 }]);
		expect(query.all({ offset: 0 })).toHaveLength(4);
	});

	it('binds a limit and offset together', () => {
		const query = db.select({ id: records.id }).from(records).orderBy(records.id)
			.limit(sql.placeholder('limit')).offset(sql.placeholder('offset')).prepare();
		expect(query.all({ limit: 1, offset: 2 })).toEqual([{ id: 3 }]);
		expect(query.all({ limit: 0, offset: 0 })).toEqual([]);
	});

	it('selects from a compound query with only an offset', () => {
		const query = db.select({ id: records.id }).from(records).where(lte(records.id, 2))
			.union(db.select({ id: records.id }).from(records))
			.orderBy(records.id).offset(2);
		expect(query.all()).toEqual([{ id: 3 }, { id: 4 }]);
	});

	it('binds an offset without a limit on a compound query', () => {
		const query = db.select({ id: records.id }).from(records)
			.union(db.select({ id: records.id }).from(records))
			.orderBy(records.id).offset(sql.placeholder('offset')).prepare();
		expect(query.all({ offset: 3 })).toEqual([{ id: 4 }]);
		expect(query.all({ offset: 0 })).toHaveLength(4);
	});

	it.each(
		[
			['union', [1, 2, 3]],
			['unionAll', [1, 2, 2, 3]],
			['intersect', [2]],
			['except', [1]],
		] as const,
	)('preserves the right operand of %s', (operator, ids) => {
		const left = db.select({ id: records.id }).from(records).where(lte(records.id, 2));
		const right = db.select({ id: records.id }).from(records).where(eq(records.id, 2))
			.unionAll(db.select({ id: records.id }).from(records).where(eq(records.id, 3)));
		expect(left[operator](right).orderBy(records.id).all()).toEqual(ids.map((id) => ({ id })));
	});

	it('preserves local ordering and limits on both operands', () => {
		const left = db.select({ id: records.id }).from(records).orderBy(asc(records.id)).limit(1);
		const right = db.select({ id: records.id }).from(records).orderBy(desc(records.id)).limit(1);
		expect(union(left, right).orderBy(records.id).all()).toEqual([{ id: 1 }, { id: 4 }]);
	});

	it('preserves an offset on the left operand', () => {
		const left = db.select({ id: records.id }).from(records).orderBy(records.id).offset(2);
		const right = db.select({ id: records.id }).from(records).where(eq(records.id, 1));
		expect(union(left, right).orderBy(records.id).all()).toEqual([{ id: 1 }, { id: 3 }, { id: 4 }]);
	});

	it('preserves a limit on an intermediate compound query', () => {
		const query = db.select({ id: records.id }).from(records).where(eq(records.id, 1))
			.unionAll(db.select({ id: records.id }).from(records).where(eq(records.id, 2)))
			.orderBy(desc(records.id)).limit(1)
			.unionAll(db.select({ id: records.id }).from(records).where(eq(records.id, 3)))
			.orderBy(records.id);
		expect(query.all()).toEqual([{ id: 2 }, { id: 3 }]);
	});

	it('keeps a CTE in scope for both operands when the left operand has a limit', () => {
		const cte = db.$with('ids').as(db.select({ id: records.id }).from(records));
		const query = db.with(cte).select({ id: cte.id }).from(cte).orderBy(cte.id).limit(1)
			.union(db.select({ id: cte.id }).from(cte).where(eq(cte.id, 4)))
			.orderBy(cte.id);
		expect(query.all()).toEqual([{ id: 1 }, { id: 4 }]);
	});

	it('preserves a CTE on the right operand', () => {
		const cte = db.$with('ids').as(db.select({ id: records.id }).from(records).where(eq(records.id, 4)));
		const query = db.select({ id: records.id }).from(records).where(eq(records.id, 1))
			.union(db.with(cte).select({ id: cte.id }).from(cte)).orderBy(records.id);
		expect(query.all()).toEqual([{ id: 1 }, { id: 4 }]);
	});

	it.each(['nothing', 'update'] as const)('handles INSERT SELECT with conflict action %s', (action) => {
		db.insert(copied).values({ id: 1, firstName: 'old', active: 1 }).run();
		const source = db.select().from(records);
		const sourceBefore = source.toSQL();
		const query = db.insert(copied).select(source);
		const result = action === 'nothing'
			? query.onConflictDoNothing().returning().all()
			: query.onConflictDoUpdate({ target: copied.id, set: { firstName: sql`excluded.first_name` } })
				.returning().all();
		expect(result).toHaveLength(action === 'nothing' ? 3 : 4);
		expect(db.select().from(copied).where(eq(copied.id, 1)).get()?.firstName)
			.toBe(action === 'nothing' ? 'old' : 'd');
		expect(source.toSQL()).toEqual(sourceBefore);
	});

	it('handles INSERT SELECT with local ordering and a limit', () => {
		const source = db.select().from(records).orderBy(desc(records.id)).limit(1);
		expect(db.insert(copied).select(source).onConflictDoNothing().returning().all())
			.toEqual([{ id: 4, firstName: 'a', active: 1 }]);
	});

	it('handles INSERT SELECT from a compound query', () => {
		const source = db.select().from(records).where(eq(records.id, 1))
			.union(db.select().from(records).where(eq(records.id, 4)));
		db.insert(copied).select(source).onConflictDoNothing().run();
		expect(db.select({ id: copied.id }).from(copied).orderBy(copied.id).all()).toEqual([{ id: 1 }, { id: 4 }]);
	});

	it('handles a raw INSERT SELECT with bound values and conflict handling', () => {
		const source = sql`select id, first_name, active from records where id = ${2}`;
		expect(db.insert(copied).select(source).onConflictDoNothing().returning().all())
			.toEqual([{ id: 2, firstName: 'c', active: 1 }]);
	});

	it('uses a partial index predicate before DO NOTHING', () => {
		client.exec('create unique index active_name on records(first_name) where active = 1');
		const insert = (id: number, active: number) =>
			db.insert(records)
				.values({ id, firstName: 'd', active })
				.onConflictDoNothing({ target: records.firstName, where: sql`${records.active} = 1` });
		expect(insert(5, 1).run().changes).toBe(0);
		expect(insert(6, 0).run().changes).toBe(1);
	});

	it('applies casing to a column used directly in compound ordering', () => {
		const query = db.select({ firstName: records.firstName }).from(records)
			.union(db.select({ firstName: records.firstName }).from(records)).orderBy(records.firstName);
		expect(query.all()).toEqual(['a', 'b', 'c', 'd'].map((firstName) => ({ firstName })));
	});

	it('preserves a shared nested ordering expression across rendering and execution', () => {
		const ordering = asc(sql`${records.firstName}`);
		const original = db.select({ firstName: records.firstName }).from(records).orderBy(ordering);
		const before = original.toSQL();
		const query = db.select({ firstName: records.firstName }).from(records)
			.union(db.select({ firstName: records.firstName }).from(records)).orderBy(ordering);
		const rendered = query.toSQL();
		expect(query.toSQL()).toEqual(rendered);
		expect(query.all()).toEqual(original.all());
		expect(original.toSQL()).toEqual(before);
		expect(before.sql).toContain('order by "records"."first_name" asc');
	});
});
