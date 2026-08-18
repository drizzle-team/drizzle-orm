import { readFile } from 'node:fs/promises';
import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
	cockroachTable,
	getTableConfig as getCockroachTableConfig,
	int4,
	uniqueIndex as cockroachUniqueIndex,
} from '~/cockroach-core/index.ts';
import {
	getTableConfig as getMsSqlTableConfig,
	int as mssqlInt,
	mssqlTable,
	uniqueIndex as mssqlUniqueIndex,
} from '~/mssql-core/index.ts';
import {
	getTableConfig as getMySqlTableConfig,
	int as mysqlInt,
	mysqlTable,
	uniqueIndex as mysqlUniqueIndex,
} from '~/mysql-core/index.ts';
import {
	getTableConfig as getPgTableConfig,
	integer as pgInteger,
	pgTable,
	uniqueIndex as pgUniqueIndex,
} from '~/pg-core/index.ts';
import {
	getTableConfig as getSingleStoreTableConfig,
	int as singlestoreInt,
	singlestoreTable,
	uniqueIndex as singlestoreUniqueIndex,
} from '~/singlestore-core/index.ts';
import {
	getTableConfig as getSQLiteTableConfig,
	integer as sqliteInteger,
	sqliteTable,
	uniqueIndex as sqliteUniqueIndex,
} from '~/sqlite-core/index.ts';

/**
 * Each dialect, wired up so the same three cases can be checked everywhere:
 * the supported array form, the same builder wrapped in an object, and an
 * object that isn't builder-shaped at all.
 */
const dialects = [
	{
		name: 'pg',
		valid: () =>
			getPgTableConfig(pgTable('users', { id: pgInteger('id') }, (t) => [pgUniqueIndex('users_id_idx').on(t.id)])),
		wrapped: () =>
			getPgTableConfig(
				pgTable('users', { id: pgInteger('id') }, (t) => [{ idIdx: pgUniqueIndex('users_id_idx').on(t.id) } as any]),
			),
		bogus: () => getPgTableConfig(pgTable('users', { id: pgInteger('id') }, () => [42 as any])),
	},
	{
		name: 'cockroach',
		valid: () =>
			getCockroachTableConfig(
				cockroachTable('users', { id: int4('id') }, (t) => [cockroachUniqueIndex('users_id_idx').on(t.id)]),
			),
		wrapped: () =>
			getCockroachTableConfig(
				cockroachTable('users', { id: int4('id') }, (t) => [
					{ idIdx: cockroachUniqueIndex('users_id_idx').on(t.id) } as any,
				]),
			),
		bogus: () => getCockroachTableConfig(cockroachTable('users', { id: int4('id') }, () => [42 as any])),
	},
	{
		name: 'mysql',
		valid: () =>
			getMySqlTableConfig(
				mysqlTable('users', { id: mysqlInt('id') }, (t) => [mysqlUniqueIndex('users_id_idx').on(t.id)]),
			),
		wrapped: () =>
			getMySqlTableConfig(
				mysqlTable('users', { id: mysqlInt('id') }, (t) => [
					{ idIdx: mysqlUniqueIndex('users_id_idx').on(t.id) } as any,
				]),
			),
		bogus: () => getMySqlTableConfig(mysqlTable('users', { id: mysqlInt('id') }, () => [42 as any])),
	},
	{
		name: 'mssql',
		valid: () =>
			getMsSqlTableConfig(
				mssqlTable('users', { id: mssqlInt('id') }, (t) => [mssqlUniqueIndex('users_id_idx').on(t.id)]),
			),
		wrapped: () =>
			getMsSqlTableConfig(
				mssqlTable('users', { id: mssqlInt('id') }, (t) => [
					{ idIdx: mssqlUniqueIndex('users_id_idx').on(t.id) } as any,
				]),
			),
		bogus: () => getMsSqlTableConfig(mssqlTable('users', { id: mssqlInt('id') }, () => [42 as any])),
	},
	{
		name: 'singlestore',
		valid: () =>
			getSingleStoreTableConfig(
				singlestoreTable('users', { id: singlestoreInt('id') }, (t) => [
					singlestoreUniqueIndex('users_id_idx').on(t.id),
				]),
			),
		wrapped: () =>
			getSingleStoreTableConfig(
				singlestoreTable('users', { id: singlestoreInt('id') }, (t) => [
					{ idIdx: singlestoreUniqueIndex('users_id_idx').on(t.id) } as any,
				]),
			),
		bogus: () => getSingleStoreTableConfig(singlestoreTable('users', { id: singlestoreInt('id') }, () => [42 as any])),
	},
	{
		name: 'sqlite',
		valid: () =>
			getSQLiteTableConfig(
				sqliteTable('users', { id: sqliteInteger('id') }, (t) => [sqliteUniqueIndex('users_id_idx').on(t.id)]),
			),
		wrapped: () =>
			getSQLiteTableConfig(
				sqliteTable('users', { id: sqliteInteger('id') }, (t) => [
					{ idIdx: sqliteUniqueIndex('users_id_idx').on(t.id) } as any,
				]),
			),
		bogus: () => getSQLiteTableConfig(sqliteTable('users', { id: sqliteInteger('id') }, () => [42 as any])),
	},
] as const;

describe.each(dialects)('$name extra config', ({ valid, wrapped, bogus }) => {
	test('builds indexes declared in the array form', () => {
		expect(valid().indexes).toHaveLength(1);
	});

	test('throws on a builder wrapped in an object instead of dropping it', () => {
		expect(wrapped).toThrowError(/Invalid extra config value for table "users"/);
		expect(wrapped).toThrowError(/not wrapped in an object/);
	});

	test('throws on a value that is not a builder at all', () => {
		expect(bogus).toThrowError(/Invalid extra config value for table "users": expected an index or constraint/);
	});
});

/**
 * `stripInternal` removes every `@internal` member from the published `.d.ts`, so a
 * builder whose members are all internal ends up structurally empty — and an empty
 * object type accepts any object, which is how unrecognised extra config values got
 * past the compiler in the first place. Guard the invariant against the real emit
 * rather than against the source, since the source keeps the internal members.
 */
describe('extra config builders stay nominal after declaration emit', () => {
	const builders = [
		['cockroach-core/primary-keys.ts', 'PrimaryKeyBuilder'],
		['cockroach-core/unique-constraint.ts', 'UniqueConstraintBuilder'],
		['mssql-core/primary-keys.ts', 'PrimaryKeyBuilder'],
		['mssql-core/unique-constraint.ts', 'UniqueConstraintBuilder'],
		['mysql-core/primary-keys.ts', 'PrimaryKeyBuilder'],
		['mysql-core/unique-constraint.ts', 'UniqueConstraintBuilder'],
		['pg-core/primary-keys.ts', 'PrimaryKeyBuilder'],
		['pg-core/unique-constraint.ts', 'UniqueConstraintBuilder'],
		['singlestore-core/primary-keys.ts', 'PrimaryKeyBuilder'],
		['singlestore-core/unique-constraint.ts', 'UniqueConstraintBuilder'],
		['sqlite-core/primary-keys.ts', 'PrimaryKeyBuilder'],
		['sqlite-core/unique-constraint.ts', 'UniqueConstraintBuilder'],
	] as const;

	test.each(builders)('%s %s', async (file, className) => {
		const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
		const declaration = ts.transpileDeclaration(source, {
			compilerOptions: { stripInternal: true, target: ts.ScriptTarget.ESNext },
		}).outputText;

		const emitted = ts.createSourceFile(file, declaration, ts.ScriptTarget.ESNext, true);
		const cls = emitted.statements.find(
			(statement): statement is ts.ClassDeclaration =>
				ts.isClassDeclaration(statement) && statement.name?.text === className,
		);
		expect(cls, `${className} is missing from the emitted declaration`).toBeDefined();

		const instanceMembers = cls!.members.filter(
			(member) =>
				!ts.isConstructorDeclaration(member)
				&& !member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword),
		);
		expect(instanceMembers.length, `${className} is structurally empty and would accept any object`)
			.toBeGreaterThan(0);
	});
});
