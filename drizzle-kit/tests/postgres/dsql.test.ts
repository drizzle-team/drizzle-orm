import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { UnsupportedSchemaChangeError } from 'src/cli/errors';
import { footprintsOf } from 'src/dialects/postgres/commutativity';
import { fromJson } from 'src/dialects/postgres/convertor';
import { createDDL } from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { dsqlIssues, replacementName, toDsql } from 'src/dialects/postgres/dsql';
import { isFootprint } from 'src/dialects/postgres/snapshot';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { mockResolver } from 'src/utils/mocks';
import { describe, expect, test } from 'vitest';
import type { DsqlCase } from '../dsql/cases';
import { dsqlCases } from '../dsql/cases';
import { diff, drizzleToDDL } from './mocks';

const byStatement = dsqlCases('dsql_kit');
const cases = Object.entries(byStatement).flatMap(([type, list]) =>
	(list as DsqlCase[]).map((it) => ({ type: type as JsonStatement['type'], ...it }))
);

// The statement types `toDsql` re-renders. Every other statement keeps beta's SQL.
const rendered = new Set<JsonStatement['type']>([
	'create_index',
	'recreate_index',
	'create_fk',
	'recreate_fk',
	'add_check',
	'alter_check',
]);

const resultOf = async (it: DsqlCase) => {
	if (it.direct) {
		const { groupedStatements, sqlStatements } = fromJson(it.direct);
		return { statements: it.direct, groupedStatements, sqlStatements, ddl: createDDL() };
	}
	const res = await diff(it.from!, it.to!, it.renames ?? []);
	return { ...res, ddl: res.next };
};

const issuesOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof UnsupportedSchemaChangeError && e.meta.kind === 'dsql_unsupported') return e.meta.issues;
		throw e;
	}
	return null;
};

describe('every statement type has a case', () => {
	test.each(Object.entries(byStatement))('%s', async (type, list) => {
		expect(list.length).toBeGreaterThan(0);
		const produced = await Promise.all(
			(list as DsqlCase[]).map(async (it) => (await resultOf(it)).statements.map((st) => st.type)),
		);
		expect(produced.flat()).toContain(type);
	});
});

describe('toDsql', () => {
	test.each(cases.map((it) => [it.name, it] as const))('%s', async (_, it) => {
		const result = await resultOf(it);
		const issues = issuesOf(() => toDsql(result, result.ddl));

		if (it.issues) {
			expect(issues).toStrictEqual(it.issues);
			return;
		}

		expect(issues).toBeNull();
		const out = toDsql(result, result.ddl);
		expect(out.sqlStatements).toStrictEqual(out.groupedStatements.flatMap((g) => g.sqlStatements));
		expect(out.statements).toBe(result.statements);

		if (it.sql) {
			expect(out.sqlStatements).toStrictEqual(it.sql);
		}

		// Statements DSQL accepts as they are keep beta's SQL.
		const groups = out.groupedStatements.map((g, i) => ({ out: g, beta: result.groupedStatements[i] }));
		for (const { out, beta } of groups) {
			if (!rendered.has(out.jsonStatement.type)) expect(out.sqlStatements).toStrictEqual(beta.sqlStatements);
		}
		if (!it.sql) {
			expect(groups.some((g) => rendered.has(g.out.jsonStatement.type))).toBe(false);
		}

		const stored: unknown[] = JSON.parse(JSON.stringify(footprintsOf(out.groupedStatements)));
		expect(stored.filter((f) => !isFootprint(f))).toStrictEqual([]);
	});
});

test('one error lists only the unsupported changes', async () => {
	const all = byStatement;
	const fine = all.create_index[0]!;
	const bad = all.create_table.find((it) => it.name === 'reject serial')!;
	const result = await diff(
		{ ...fine.from, ...bad.from },
		{ ...fine.to, ...bad.to },
		[],
	);

	const issues = issuesOf(() => toDsql(result, result.next));
	expect(issues).toStrictEqual(bad.issues);
});

test('the error message lists every issue', async () => {
	const bad = byStatement.create_index.find((it) => it.name === 'reject index options DSQL refuses')!;
	const result = await diff(bad.from!, bad.to!, []);

	let error: unknown;
	try {
		toDsql(result, result.next);
	} catch (e) {
		error = e;
	}

	expect(error).toBeInstanceOf(UnsupportedSchemaChangeError);
	const lines = (error as Error).message.split('\n');
	expect(lines[0]).toBe('Aurora DSQL does not support these schema changes:');
	expect(lines.slice(1)).toStrictEqual(
		bad.issues!.map((it) => `- ${it.statement} ${it.entity}: ${it.reason}`),
	);
});

test('a convertor change that breaks a rewrite fails loudly', async () => {
	const result = await resultOf(byStatement.create_index[0]!);
	const broken = {
		...result,
		groupedStatements: result.groupedStatements.map((it) => ({ ...it, sqlStatements: ['CREATE FOO;'] })),
	};
	expect(() => toDsql(broken, result.ddl)).toThrowError(/expected beta's create_index SQL/);
});

describe('replacementName', () => {
	test('appends the suffix to a short name', () => {
		expect(replacementName('users_age_idx')).toBe('users_age_idx_dsql_new');
	});

	test('shortens a long name so the result fits in 63 bytes', () => {
		const name = 'x'.repeat(63);
		const tmp = replacementName(name);
		expect(tmp).toBe(`${'x'.repeat(54)}_dsql_new`);
		expect(new TextEncoder().encode(tmp).length).toBe(63);
	});

	test('counts bytes, not characters, and never splits a character', () => {
		const tmp = replacementName('é'.repeat(30));
		expect(new TextEncoder().encode(tmp).length).toBeLessThanOrEqual(63);
		expect(tmp).toBe(`${'é'.repeat(27)}_dsql_new`);
	});
});

test('a long index name is replaced under a shortened temporary name', async () => {
	const name = 'i'.repeat(63);
	const from = { t: pgTable('t', { id: uuid().primaryKey(), a: integer() }, (t) => [index(name).on(t.a)]) };
	const to = {
		t: pgTable('t', { id: uuid().primaryKey(), a: integer() }, (t) => [index(name).on(t.a).where(sql`${t.a} > 0`)]),
	};
	const res = await diff(from, to, []);
	const tmp = `${'i'.repeat(54)}_dsql_new`;
	expect(toDsql(res, res.next).sqlStatements).toStrictEqual([
		`CREATE INDEX ASYNC "${tmp}" ON "t" ("a") WHERE "a" > 0;`,
		`DROP INDEX IF EXISTS "${name}";`,
		`ALTER INDEX "${tmp}" RENAME TO "${name}";`,
	]);
});

// A foreign key depends on the unique index of the columns it references, so DSQL refuses to drop that index
// (2BP01). Building the replacement first would leave it behind, so beta's order is kept and nothing changes.
test('a unique index that a foreign key references keeps the drop first', async () => {
	const parent = (nullsFirst?: boolean) =>
		pgTable('parent', { id: uuid().primaryKey(), code: integer() }, (t) => [
			uniqueIndex('parent_code_idx').on(nullsFirst ? t.code.nullsFirst() : t.code),
		]);
	const child = (p: ReturnType<typeof parent>) =>
		pgTable('child', { id: uuid().primaryKey(), code: integer() }, (t) => [
			foreignKey({ name: 'child_fk', columns: [t.code], foreignColumns: [p.code] }),
		]);
	const from = parent();
	const to = parent(true);
	const res = await diff({ parent: from, child: child(from) }, { parent: to, child: child(to) }, []);
	expect(toDsql(res, res.next).sqlStatements).toStrictEqual([
		'DROP INDEX IF EXISTS "parent_code_idx";',
		'CREATE UNIQUE INDEX ASYNC "parent_code_idx" ON "parent" ("code" NULLS FIRST);',
	]);
});

// The foreign key is recreated after the index, so it still references the index when the index is replaced.
test('a unique index whose foreign key moves away in the same change keeps the drop first', async () => {
	const parent = (nullsFirst?: boolean) =>
		pgTable('parent', { id: uuid().primaryKey(), code: integer() }, (t) => [
			uniqueIndex('parent_code_idx').on(nullsFirst ? t.code.nullsFirst() : t.code),
		]);
	const child = (p: ReturnType<typeof parent>, toId?: boolean) =>
		pgTable('child', { id: uuid().primaryKey(), code: integer(), pid: uuid() }, (t) => [
			toId
				? foreignKey({ name: 'child_fk', columns: [t.pid], foreignColumns: [p.id] })
				: foreignKey({ name: 'child_fk', columns: [t.code], foreignColumns: [p.code] }),
		]);
	const from = parent();
	const to = parent(true);
	const res = await diff({ parent: from, child: child(from) }, { parent: to, child: child(to, true) }, []);
	expect(toDsql(res, res.next).sqlStatements.slice(0, 2)).toStrictEqual([
		'DROP INDEX IF EXISTS "parent_code_idx";',
		'CREATE UNIQUE INDEX ASYNC "parent_code_idx" ON "parent" ("code" NULLS FIRST);',
	]);
});

// The foreign key is created after the index, so the index is replaced before anything depends on it.
test('a unique index that a new foreign key references is built before the old one is dropped', async () => {
	const from = pgTable('parent', { id: uuid().primaryKey(), code: integer(), other: integer() }, (t) => [
		uniqueIndex('parent_code_idx').on(t.code),
	]);
	const to = pgTable('parent', { id: uuid().primaryKey(), code: integer(), other: integer() }, (t) => [
		uniqueIndex('parent_code_idx').on(t.other),
		uniqueIndex('parent_code2_idx').on(t.code),
	]);
	const child = pgTable('child', { id: uuid().primaryKey(), code: integer() }, (t) => [
		foreignKey({ name: 'child_fk', columns: [t.code], foreignColumns: [to.code] }),
	]);
	const res = await diff({ parent: from, child: pgTable('child', { id: uuid().primaryKey(), code: integer() }) }, {
		parent: to,
		child,
	}, []);
	expect(toDsql(res, res.next).sqlStatements.slice(0, 3)).toStrictEqual([
		'CREATE UNIQUE INDEX ASYNC "parent_code_idx_dsql_new" ON "parent" ("other");',
		'DROP INDEX IF EXISTS "parent_code_idx";',
		'ALTER INDEX "parent_code_idx_dsql_new" RENAME TO "parent_code_idx";',
	]);
});

// A `$` in a replacement string is a pattern, so the name must reach the SQL as it is.
test.each(['foo$1', 'foo$&bar'])('an index named %s is replaced under its own name', async (name) => {
	const from = { t: pgTable('t', { id: uuid().primaryKey(), a: integer() }, (t) => [index(name).on(t.a)]) };
	const to = {
		t: pgTable('t', { id: uuid().primaryKey(), a: integer() }, (t) => [index(name).on(t.a).where(sql`${t.a} > 0`)]),
	};
	const res = await diff(from, to, []);
	expect(toDsql(res, res.next).sqlStatements).toStrictEqual([
		`CREATE INDEX ASYNC "${name}_dsql_new" ON "t" ("a") WHERE "a" > 0;`,
		`DROP INDEX IF EXISTS "${name}";`,
		`ALTER INDEX "${name}_dsql_new" RENAME TO "${name}";`,
	]);
});

// The foreign keys are bound to the primary key and the unique constraint, so the unique indexes can be dropped.
test('a unique index beside a primary key or unique constraint of the same columns is built first', async () => {
	const parent = (nullsFirst?: boolean) =>
		pgTable('parent', { id: uuid().primaryKey(), code: integer().unique('parent_code_key') }, (t) => [
			uniqueIndex('parent_id_idx').on(nullsFirst ? t.id.nullsFirst() : t.id),
			uniqueIndex('parent_code_idx').on(nullsFirst ? t.code.nullsFirst() : t.code),
		]);
	const child = (p: ReturnType<typeof parent>) =>
		pgTable('child', { id: uuid().primaryKey(), pid: uuid(), code: integer() }, (t) => [
			foreignKey({ name: 'child_pid_fk', columns: [t.pid], foreignColumns: [p.id] }),
			foreignKey({ name: 'child_code_fk', columns: [t.code], foreignColumns: [p.code] }),
		]);
	const from = parent();
	const to = parent(true);
	const res = await diff({ parent: from, child: child(from) }, { parent: to, child: child(to) }, []);
	expect(toDsql(res, res.next).sqlStatements.filter((it) => it.startsWith('CREATE')).sort()).toStrictEqual([
		'CREATE UNIQUE INDEX ASYNC "parent_code_idx_dsql_new" ON "parent" ("code" NULLS FIRST);',
		'CREATE UNIQUE INDEX ASYNC "parent_id_idx_dsql_new" ON "parent" ("id" NULLS FIRST);',
	]);
});

// DSQL allows 24 indexes on a table, its primary key and unique constraints included.
describe('a table without room for a replacement index', () => {
	const range = (n: number) => {
		const it: number[] = new Array(n);
		for (let i = 0; i < n; i++) it[i] = i;
		return it;
	};
	const table = (indexes: number, opts: { unique?: boolean; changed?: boolean } = {}) =>
		pgTable(
			't',
			{
				id: uuid().primaryKey(),
				u: opts.unique ? integer().unique('t_u_key') : integer(),
				...Object.fromEntries(range(23).map((i) => [`c${i}`, integer()])),
			},
			(t: Record<string, any>) =>
				range(indexes).map((i) =>
					i === 0 && opts.changed
						? index('i0').on(t['c0']).where(sql`${t['c0']} > 0`)
						: index(`i${i}`).on(t[`c${i}`])
				),
		);
	const replaced = ['CREATE INDEX ASYNC "i0_dsql_new" ON "t" ("c0") WHERE "c0" > 0;', 'DROP INDEX IF EXISTS "i0";'];
	const dropFirst = ['DROP INDEX IF EXISTS "i0";', 'CREATE INDEX ASYNC "i0" ON "t" ("c0") WHERE "c0" > 0;'];
	const first2 = async (from: ReturnType<typeof table>, to: ReturnType<typeof table>) => {
		const res = await diff({ t: from }, { t: to }, []);
		return toDsql(res, res.next).sqlStatements.slice(0, 2);
	};

	test('builds the replacement when the table has 23', async () => {
		expect(await first2(table(22), table(22, { changed: true }))).toStrictEqual(replaced);
	});

	test('drops first when the table has 24, a unique constraint included', async () => {
		expect(await first2(table(22, { unique: true }), table(22, { unique: true, changed: true }))).toStrictEqual(
			dropFirst,
		);
	});

	test('builds the replacement before an index created in the same change', async () => {
		expect(await first2(table(22), table(23, { changed: true }))).toStrictEqual(replaced);
	});
});

// The live suite pushes each rejected change and expects these issues, so push mode must report the same ones,
// apart from the changes push ignores on purpose.
describe('push reports the same issues as generate', () => {
	const rejected = cases.filter((it) => it.issues && !it.direct);
	test.each(rejected.map((it) => [it.name, it] as const))('%s', async (_, it) => {
		const renames = new Set(it.renames ?? []);
		const to = drizzleToDDL(it.to!).ddl;
		const m = () => mockResolver<any>(renames);
		const result = await ddlDiff(
			drizzleToDDL(it.from!).ddl,
			to,
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			m(),
			'push',
		);

		expect(dsqlIssues(result.statements, to)).toStrictEqual(it.pushIgnores ? [] : it.issues);
	});
});
