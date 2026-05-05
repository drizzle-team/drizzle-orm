import { stripAnsi } from 'hanji/utils';
import { suggestions } from 'src/cli/commands/push-postgres';
import { runWithCliContext } from 'src/cli/context';
import { type Hint, HintsHandler } from 'src/cli/hints';
import { resolver } from 'src/cli/prompts';
import {
	type CheckConstraint,
	type Column,
	createDDL,
	type Enum,
	type ForeignKey,
	type Index,
	type Policy,
	type PostgresEntities,
	type PrimaryKey,
	type Privilege,
	type Role,
	type Schema,
	type Sequence,
	type Table,
	type UniqueConstraint,
	type View,
} from 'src/dialects/postgres/ddl';
import { ddlDiff } from 'src/dialects/postgres/diff';
import { prepareStatement } from 'src/dialects/postgres/statements';
import type { DB } from 'src/utils';
import { afterEach, expect, test, vi } from 'vitest';

const table = (name: string, schema = 'public') =>
	({
		schema,
		name,
		columns: [],
		indexes: [],
		pk: null,
		fks: [],
		uniques: [],
		checks: [],
		policies: [],
		isRlsEnabled: false,
	}) satisfies Table;

const column = (tableName: string, name: string, schema = 'public', overrides: Partial<Column> = {}) =>
	({
		schema,
		table: tableName,
		name,
		type: 'text',
		typeSchema: 'pg_catalog',
		notNull: false,
		dimensions: 0,
		default: null,
		generated: null,
		identity: null,
		entityType: 'columns' as const,
		...overrides,
	}) satisfies Column;

const view = (name: string, schema = 'public', overrides: Partial<View> = {}) =>
	({
		schema,
		name,
		definition: null,
		with: null,
		withNoData: null,
		using: null,
		tablespace: null,
		materialized: true,
		entityType: 'views' as const,
		...overrides,
	}) satisfies View;

const primaryKey = (tableName: string, name: string, schema = 'public', nameExplicit = true) =>
	({
		schema,
		table: tableName,
		name,
		columns: ['id'],
		nameExplicit,
		entityType: 'pks' as const,
	}) satisfies PrimaryKey;

const unique = (tableName: string, name: string, columnName: string, schema = 'public') =>
	({
		schema,
		table: tableName,
		name,
		nameExplicit: true,
		columns: [columnName],
		nullsNotDistinct: false,
		entityType: 'uniques' as const,
	}) satisfies UniqueConstraint;

const unresolved = (hints: HintsHandler) => hints.missingHints;

const createDb = (responder: (sql: string) => Promise<unknown[]> | unknown[]) => {
	const queries: string[] = [];
	const db: DB = {
		query: async <T>(sql: string) => {
			queries.push(sql);
			const rows = await responder(sql);
			return rows as T[];
		},
	};

	return { db, queries };
};

const runPushDiff = async (
	ddlFrom: ReturnType<typeof createDDL>,
	ddlTo: ReturnType<typeof createDDL>,
	hintsInput?: readonly Hint[],
) => {
	const hints = new HintsHandler(hintsInput ?? []);

	const diffResult = await ddlDiff(
		ddlFrom,
		ddlTo,
		resolver<Schema>('schema', 'public', hints),
		resolver<Enum>('enum', 'public', hints),
		resolver<Sequence>('sequence', 'public', hints),
		resolver<Policy>('policy', 'public', hints),
		resolver<Role>('role', 'public', hints),
		resolver<Privilege>('privilege', 'public', hints),
		resolver<PostgresEntities['tables']>('table', 'public', hints),
		resolver<Column>('column', 'public', hints),
		resolver<View>('view', 'public', hints),
		resolver<UniqueConstraint>('unique', 'public', hints),
		resolver<Index>('index', 'public', hints),
		resolver<CheckConstraint>('check', 'public', hints),
		resolver<PrimaryKey>('primary key', 'public', hints),
		resolver<ForeignKey>('foreign key', 'public', hints),
		'push',
	);

	return { ...diffResult, hints };
};

afterEach(() => {
	vi.restoreAllMocks();
});

test('json mode skips the drop-table probe when a confirm hint already authorizes it', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hints = new HintsHandler([
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'orders'] as const },
		]);

		const { db, queries } = createDb(async (sql) => {
			throw new Error(`probe should have been skipped: ${sql}`);
		});

		const result = await suggestions(db, [
			prepareStatement('drop_table', { table: table('orders'), key: '"orders"' }),
		], hints);

		expect(result).toStrictEqual([]);
		expect(queries).toStrictEqual([]);
		expect(unresolved(hints)).toStrictEqual([]);
	});
});

test('json mode auto-authorizes an empty materialized-view probe without recording a missing confirm hint', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hints = new HintsHandler();
		const { db, queries } = createDb(async () => []);

		const result = await suggestions(db, [
			prepareStatement('drop_view', { view: view('orders_mv'), cause: null }),
		], hints);

		expect(result).toStrictEqual([]);
		expect(queries).toStrictEqual(['select 1 from "orders_mv" limit 1']);
		expect(unresolved(hints)).toStrictEqual([]);
	});
});

test('json mode records add_not_null confirmation when the target table is non-empty', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hints = new HintsHandler();
		const { db, queries } = createDb(async () => [{}]);

		const result = await suggestions(db, [
			prepareStatement('add_column', {
				column: column('orders', 'status', 'public', { notNull: true }),
				isPK: false,
				isCompositePK: false,
			}),
		], hints);

		expect(result).toStrictEqual([]);
		expect(queries).toStrictEqual(['select 1 from "orders" limit 1']);
		expect(unresolved(hints)).toStrictEqual([
			{
				type: 'confirm_data_loss',
				kind: 'add_not_null',
				entity: ['public', 'orders', 'status'],
				reason: 'nulls_present',
			},
		]);
	});
});

test('json mode records only the risky probe sites when multiple probes have mixed outcomes', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hints = new HintsHandler();
		const { db, queries } = createDb(async (sql) => {
			if (sql.includes(`table_schema = 'archive'`)) {
				return [{ count: '2' }];
			}

			if (sql === 'select 1 from "legacy_users" limit 1') {
				return [];
			}

			if (sql === 'select 1 from "users" limit 1') {
				return [{}];
			}

			throw new Error(`Unexpected SQL: ${sql}`);
		});

		const result = await suggestions(db, [
			prepareStatement('drop_schema', { name: 'archive' }),
			prepareStatement('drop_column', { column: column('legacy_users', 'legacy_flag') }),
			prepareStatement('add_unique', { unique: unique('users', 'users_email_unique', 'email') }),
		], hints);

		expect(result).toStrictEqual([]);
		expect(queries).toStrictEqual([
			`select count(*) as count from information_schema.tables where table_schema = 'archive';`,
			'select 1 from "legacy_users" limit 1',
			'select 1 from "users" limit 1',
		]);
		expect(unresolved(hints)).toStrictEqual([
			{ type: 'confirm_data_loss', kind: 'schema', entity: ['archive'], reason: 'non_empty' },
			{
				type: 'confirm_data_loss',
				kind: 'add_unique',
				entity: ['public', 'users', 'users_email_unique'],
				reason: 'duplicates_present',
			},
		]);
	});
});

test('tty mode keeps the existing drop-pk hint path, including the constraint-name lookup statement', async () => {
	await runWithCliContext({ json: false }, async () => {
		const hintsHandler = new HintsHandler();
		const { db, queries } = createDb(async (sql) => {
			if (sql === 'select 1 from "public"."orders" limit 1') {
				return [{}];
			}

			if (sql.includes('information_schema.table_constraints')) {
				return [{ name: 'orders_actual_pkey' }];
			}

			throw new Error(`Unexpected SQL: ${sql}`);
		});

		const hints = await suggestions(db, [
			prepareStatement('drop_pk', { pk: primaryKey('orders', 'orders_pkey', 'public', false) }),
		], hintsHandler);

		expect(queries).toStrictEqual([
			'select 1 from "public"."orders" limit 1',
			`\n        SELECT constraint_name as name \n        FROM information_schema.table_constraints\n        WHERE \n          table_schema = 'public'\n          AND table_name = 'orders'\n          AND constraint_type = 'PRIMARY KEY';`,
		]);
		expect(hints).toHaveLength(1);
		expect(stripAnsi(hints[0]!.hint).replace(/^·\s*/, '')).toBe(
			'You\'re about to drop "public"."orders" primary key, this statements may fail and your table may lose primary key',
		);
		expect(hints[0]!.statement).toBe('ALTER TABLE "public"."orders" DROP CONSTRAINT "orders_actual_pkey"');
	});
});

test('rename hints resolve orders to orders1 before probes so no stale orders1 select is attempted', async () => {
	await runWithCliContext({ json: true }, async () => {
		const hintsInput = [
			{ type: 'rename', kind: 'table', from: ['public', 'orders'] as const, to: ['public', 'orders1'] as const },
		] satisfies readonly Hint[];

		const ddlFrom = createDDL();
		ddlFrom.tables.push({ schema: 'public', name: 'orders', isRlsEnabled: false });

		const ddlTo = createDDL();
		ddlTo.tables.push({ schema: 'public', name: 'orders1', isRlsEnabled: false });

		const diffResult = await runPushDiff(ddlFrom, ddlTo, hintsInput);
		const statementTypes = diffResult.statements.map((statement) => statement.type);

		expect(statementTypes).toContain('rename_table');
		expect(statementTypes).not.toContain('drop_table');
		expect(statementTypes).not.toContain('create_table');
		expect(unresolved(diffResult.hints)).toStrictEqual([]);

		const { db, queries } = createDb(async (sql) => {
			throw new Error(`rename-resolved diffs should not probe the database: ${sql}`);
		});

		const suggestionHints = new HintsHandler(hintsInput);
		const hints = await suggestions(db, diffResult.statements, suggestionHints);

		expect(hints).toStrictEqual([]);
		expect(queries).toStrictEqual([]);
		expect(unresolved(suggestionHints)).toStrictEqual([]);
	});
});
