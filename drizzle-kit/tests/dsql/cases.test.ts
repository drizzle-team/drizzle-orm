import { UnsupportedSchemaChangeError } from 'src/cli/errors';
import { fromJson } from 'src/dialects/postgres/convertor';
import { createDDL } from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { DSQL_REASONS, DSQL_SYSTEM_ROLES, dsqlIssues, runDsqlStatements, toDsql } from 'src/dialects/postgres/dsql';
import type { JsonStatement } from 'src/dialects/postgres/statements';
import { mockResolver } from 'src/utils/mocks';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { DsqlCase } from './cases';
import { dsqlCases } from './cases';
import {
	assertNothingLeft,
	connect,
	dropRun,
	type DsqlDB,
	introspectDDL,
	pushAndSettle,
	pushTo,
	runId,
	sqlstateOf,
	toDDL,
} from './mocks';

const byStatement = dsqlCases(runId);
const cases = Object.values(byStatement).flatMap((it) => it as DsqlCase[]);
const allRoles = [...new Set(cases.flatMap((it) => it.roles ?? []))];

// Every DSQL index build and constraint validation is an async job that takes several seconds.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

let db: DsqlDB;

beforeAll(async () => {
	db = await connect();
	await dropRun(db, allRoles);
});

afterAll(async () => {
	await dropRun(db, allRoles);
	await assertNothingLeft(db);
});

// A case's `from` state can only be built on DSQL when it has no DSQL issues of its own, for example an enum
// that a later change drops.
const buildable = async (it: DsqlCase) => {
	const empty = createDDL();
	const target = toDDL(it.from ?? {}, it.roles ?? []);
	const mocks = new Set<string>();
	const result = await ddlDiff(
		empty,
		target,
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		'push',
	);
	return dsqlIssues(result.statements, target).length === 0;
};

const generated = async (it: DsqlCase) => {
	const from = toDDL(it.from!, it.roles ?? []);
	const to = toDDL(it.to!, it.roles ?? []);
	const renames = new Set(it.renames ?? []);
	const result = await ddlDiff(
		from,
		to,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return toDsql(result, to).sqlStatements;
};

const supported = cases.filter((it) => !it.issues && !it.direct && !it.offline);

describe('the SQL generate writes runs on DSQL, and push then finds nothing to change', () => {
	test.each(supported.map((it) => [it.name, it] as const))('%s', async (_, it) => {
		await dropRun(db, it.roles ?? []);
		await pushAndSettle(db, it.from!, { roles: it.roles });

		const sql = await generated(it);
		expect(sql.length, 'the case changes something').toBeGreaterThan(0);
		if (it.sql) expect(sql).toStrictEqual(it.sql);
		await runDsqlStatements(db, sql);

		expect(await pushTo(db, it.to!, { roles: it.roles }), 'push after the migration').toStrictEqual([]);
		await dropRun(db, it.roles ?? []);
	});
});

describe('push runs a supported change on DSQL, and a second push changes nothing', () => {
	test.each(supported.map((it) => [it.name, it] as const))('%s', async (_, it) => {
		await dropRun(db, it.roles ?? []);
		await pushAndSettle(db, it.from!, { roles: it.roles });
		await pushAndSettle(db, it.to!, { renames: it.renames, roles: it.roles });
		await dropRun(db, it.roles ?? []);
	});
});

// A case's `from` state can be built on DSQL only when it has no DSQL issues of its own. The others hold an
// object DSQL doesn't have, such as an enum that a later change drops, so their canaries are the live proof.
const rejected = cases.filter((it) => it.issues && !it.direct && !it.offline);
const built = await Promise.all(rejected.map(async (it) => ({ it, buildable: await buildable(it) })));

test('only cases whose starting state DSQL lacks are left out of the live rejections', () => {
	const missing = [
		DSQL_REASONS.enum,
		DSQL_REASONS.policy,
		DSQL_REASONS.rls,
		DSQL_REASONS.materializedView,
		...DSQL_SYSTEM_ROLES.map((it) => DSQL_REASONS.systemRole(it)),
	];
	for (const { it } of built.filter((it) => !it.buildable)) {
		expect(it.issues!.every((issue) => missing.includes(issue.reason)), it.name).toBe(true);
	}
});

describe('a change DSQL rejects fails before anything runs', () => {
	const live = built.filter((it) => it.buildable).map(({ it }) => it);
	test.each(live.map((it) => [it.name, it] as const))('%s', async (_, it) => {
		await dropRun(db, it.roles ?? []);
		await pushAndSettle(db, it.from!, { roles: it.roles });
		const before = await introspectDDL(db, it.roles ?? []);

		if (it.pushIgnores) {
			expect(await pushTo(db, it.to!, { renames: it.renames, roles: it.roles })).toStrictEqual([]);
		} else {
			const error = await pushTo(db, it.to!, { renames: it.renames, roles: it.roles }).catch((e) => e);
			expect(error).toBeInstanceOf(UnsupportedSchemaChangeError);
			expect(error.meta.issues).toStrictEqual(it.issues);
		}

		const after = await introspectDDL(db, it.roles ?? []);
		expect(after.entities.list()).toStrictEqual(before.entities.list());
		await dropRun(db, it.roles ?? []);
	});
});

describe('DSQL still refuses the plain Postgres SQL of every rejection', () => {
	const canaries = cases.flatMap((it) =>
		[...(it.canary ? [it.canary] : []), ...(it.canaries ?? [])].map((canary) => ({ it, canary }))
	);
	test.each(canaries.map(({ it, canary }) => [`${it.name}: ${canary.rejected}`, it, canary] as const))(
		'%s',
		async (_, it, canary) => {
			await dropRun(db, it.roles ?? []);
			await db.query(`CREATE SCHEMA "${runId}";`);
			for (const statement of canary.setup) await runDsqlStatements(db, [statement]);

			await runDsqlStatements(db, [canary.ok]);
			const error = await db.query(canary.rejected).then(() => null, (e) => e);

			expect(error, 'DSQL accepts it now, so the rule can go').not.toBeNull();
			expect(sqlstateOf(error)).toBe(canary.sqlstate);
			expect(String(error.message)).toContain(canary.message);
			await dropRun(db, it.roles ?? []);
		},
	);
});

describe('statements no schema produces today', () => {
	const direct = cases.filter((it) => it.direct && !it.issues);
	test('every supported one has a live check', () => {
		expect(direct.filter((it) => !it.live).map((it) => it.name)).toStrictEqual([]);
	});

	test.each(direct.map((it) => [it.name, it] as const))('%s', async (_, it) => {
		const { groupedStatements, sqlStatements } = fromJson(it.direct as JsonStatement[]);
		const result = { statements: it.direct as JsonStatement[], groupedStatements, sqlStatements };
		const sql = toDsql(result, createDDL()).sqlStatements;
		expect(sql.length).toBeGreaterThan(0);

		await dropRun(db, it.roles ?? []);
		await db.query(`CREATE SCHEMA "${runId}";`);
		for (const statement of it.live!.setup) await db.query(statement);
		await runDsqlStatements(db, sql);

		const rows = (await db.query<{ row: string }>(it.live!.check)).map((row) => row.row);
		for (const row of it.live!.includes ?? []) expect(rows).toContain(row);
		for (const row of it.live!.excludes ?? []) expect(rows).not.toContain(row);
		await dropRun(db, it.roles ?? []);
	});
});
