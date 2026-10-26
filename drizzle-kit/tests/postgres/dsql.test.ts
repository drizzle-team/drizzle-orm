import { UnsupportedSchemaChangeError } from 'src/cli/errors';
import { footprintsOf } from 'src/dialects/postgres/commutativity';
import { fromJson } from 'src/dialects/postgres/convertor';
import { createDDL } from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { dsqlIssues, toDsql } from 'src/dialects/postgres/dsql';
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
