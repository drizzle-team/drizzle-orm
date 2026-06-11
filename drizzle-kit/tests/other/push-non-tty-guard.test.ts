import { afterEach, expect, test, vi } from 'vitest';
import { HintsHandler } from '../../src/cli/hints';

const runWithCliContext = async <T>(
	context: { output: 'text' | 'json'; interactive: boolean },
	callback: () => Promise<T> | T,
): Promise<T> => {
	const ctx = await import('../../src/cli/context');
	return ctx.runWithCliContext(context, callback);
};

const mockNoopProgressView = () => {
	vi.doMock('../../src/cli/views', async () => {
		const actual = await vi.importActual<typeof import('../../src/cli/views')>('../../src/cli/views');

		class NoopProgressView {
			constructor(..._args: unknown[]) {}
			update(..._args: unknown[]) {}
			stop() {}
		}

		return {
			...actual,
			ProgressView: NoopProgressView,
			EmptyProgressView: NoopProgressView,
		};
	});
};

// Every dialect's data-loss probe runs `select 1 from <table> limit 1` (or the mssql/cockroach variant).
// A single row makes the dropped table read as non-empty, which is what drives the confirm_data_loss decision.
const nonEmptyProbeDb = { query: vi.fn(async () => [{}]), batch: vi.fn(async () => []) } as never;

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

test('push sqlite under text + non-TTY resolves to missing_hints for a non-empty drop instead of reaching the prompt', async () => {
	mockNoopProgressView();
	vi.doMock('../../src/cli/commands/pull-sqlite', () => ({
		introspect: vi.fn(async () => ({ ddl: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({ extractSqliteExisting: vi.fn(() => ({})) }));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/sqlite/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ tables: [], views: [] })),
	}));
	vi.doMock('../../src/dialects/sqlite/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/sqlite/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['DROP TABLE `orders`;'],
			statements: [{ type: 'drop_table', tableName: 'orders' }],
			groupedStatements: [],
		})),
	}));

	const pushSqlite = await import('../../src/cli/commands/push-sqlite');

	const promise = runWithCliContext({ output: 'text', interactive: false }, () =>
		pushSqlite.handle(
			nonEmptyProbeDb,
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			'sqlite',
			new HintsHandler(),
		));

	const env = await promise;
	expect(env).toMatchObject({ status: 'missing_hints' });
});

test('push postgres under text + non-TTY resolves to missing_hints for a non-empty drop instead of reaching the prompt', async () => {
	mockNoopProgressView();
	vi.doMock('../../src/cli/connections', () => ({
		preparePostgresDB: vi.fn(async () => nonEmptyProbeDb),
	}));
	vi.doMock('../../src/cli/commands/pull-postgres', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({ extractPostgresExisting: vi.fn(() => ({})) }));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/postgres/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));
	vi.doMock('../../src/dialects/postgres/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/postgres/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['DROP TABLE "orders";'],
			statements: [{ type: 'drop_table', table: { schema: 'public', name: 'orders' }, key: '"orders"' }],
			groupedStatements: [],
		})),
	}));

	const pushPostgres = await import('../../src/cli/commands/push-postgres');

	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushPostgres.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({ status: 'missing_hints' });
});

test('push mysql under text + non-TTY resolves to missing_hints for a non-empty drop instead of reaching the prompt', async () => {
	mockNoopProgressView();
	vi.doMock('../../src/cli/connections', () => ({
		connectToMySQL: vi.fn(async () => ({ db: nonEmptyProbeDb, database: 'db' })),
	}));
	vi.doMock('../../src/cli/commands/pull-mysql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({ extractMysqlExisting: vi.fn(() => ({})) }));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/mysql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mysql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['DROP TABLE `orders`;'],
			statements: [{ type: 'drop_table', table: 'orders' }],
			groupedStatements: [],
		})),
	}));

	const pushMysql = await import('../../src/cli/commands/push-mysql');

	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushMysql.handle(
			['schema.ts'],
			{} as never,
			false,
			false,
			{} as never,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({ status: 'missing_hints' });
});

test('push mssql under text + non-TTY resolves to missing_hints for a non-empty drop instead of reaching the prompt', async () => {
	mockNoopProgressView();
	vi.doMock('../../src/cli/connections', () => ({
		connectToMsSQL: vi.fn(async () => ({ db: nonEmptyProbeDb })),
	}));
	vi.doMock('../../src/cli/commands/pull-mssql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({ extractMssqlExisting: vi.fn(() => ({})) }));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/mssql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['DROP TABLE [orders];'],
			statements: [{ type: 'drop_table', table: { schema: 'dbo', name: 'orders' } }],
			groupedStatements: [],
		})),
	}));

	const pushMssql = await import('../../src/cli/commands/push-mssql');

	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushMssql.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'dbo' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({ status: 'missing_hints' });
});

test('push mssql under text + non-TTY surfaces a typed error for an unsupported rename_schema instead of silently applying', async () => {
	mockNoopProgressView();
	vi.doMock('../../src/cli/connections', () => ({
		connectToMsSQL: vi.fn(async () => ({ db: nonEmptyProbeDb })),
	}));
	vi.doMock('../../src/cli/commands/pull-mssql', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({ extractMssqlExisting: vi.fn(() => ({})) }));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/mssql/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/mssql/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ["EXEC sp_rename 'old_schema', 'new_schema';"],
			statements: [{ type: 'rename_schema', from: { name: 'old_schema' }, to: { name: 'new_schema' } }],
			groupedStatements: [],
		})),
	}));

	const { UnsupportedSchemaChangeError } = await import('../../src/cli/errors');
	const pushMssql = await import('../../src/cli/commands/push-mssql');

	await expect(runWithCliContext({ output: 'text', interactive: false }, () =>
		pushMssql.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'dbo' },
			new HintsHandler(),
		))).rejects.toBeInstanceOf(UnsupportedSchemaChangeError);
});

test('push cockroach under text + non-TTY resolves to missing_hints for a non-empty drop instead of reaching the prompt', async () => {
	mockNoopProgressView();
	vi.doMock('../../src/cli/connections', () => ({
		prepareCockroach: vi.fn(async () => nonEmptyProbeDb),
	}));
	vi.doMock('../../src/cli/commands/pull-cockroach', () => ({
		introspect: vi.fn(async () => ({ schema: { from: 'db' } })),
	}));
	vi.doMock('../../src/dialects/drizzle', () => ({ extractCrdbExisting: vi.fn(() => ({})) }));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/cockroach/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ schemas: [], views: [], matViews: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' }, errors: [], warnings: [] })),
	}));
	vi.doMock('../../src/dialects/cockroach/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/cockroach/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['DROP TABLE "orders";'],
			statements: [{ type: 'drop_table', table: { schema: 'public', name: 'orders' }, key: '"orders"' }],
			groupedStatements: [],
		})),
	}));

	const pushCockroach = await import('../../src/cli/commands/push-cockroach');

	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushCockroach.handle(
			['schema.ts'],
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({ status: 'missing_hints' });
});

test('push singlestore under text + non-TTY resolves to missing_hints for a non-empty drop instead of reaching the prompt', async () => {
	mockNoopProgressView();
	// singlestore drives its pull progress through hanji's renderWithTask directly (not ProgressView),
	// so resolve the task without a terminal while leaving render() real — the Select must still reach hanji.
	vi.doMock('hanji', async () => {
		const actual = await vi.importActual<typeof import('hanji')>('hanji');
		return {
			...actual,
			renderWithTask: vi.fn(async (_view: unknown, task: Promise<unknown>) => task),
		};
	});
	vi.doMock('../../src/cli/connections', () => ({
		connectToSingleStore: vi.fn(async () => ({ db: nonEmptyProbeDb, database: 'db' })),
	}));
	vi.doMock('../../src/dialects/mysql/introspect', () => ({
		fromDatabaseForDrizzle: vi.fn(async () => ({ from: 'db' })),
	}));
	vi.doMock('../../src/dialects/pull-utils', () => ({ prepareEntityFilter: vi.fn(() => () => true) }));
	vi.doMock('../../src/dialects/singlestore/drizzle', () => ({
		prepareFromSchemaFiles: vi.fn(async () => ({ tables: [] })),
		fromDrizzleSchema: vi.fn(() => ({ schema: { to: 'schema' } })),
	}));
	vi.doMock('../../src/dialects/mysql/ddl', () => ({
		interimToDDL: vi.fn(() => ({ ddl: { to: 'schema' }, errors: [] })),
	}));
	vi.doMock('../../src/dialects/singlestore/diff', () => ({
		ddlDiff: vi.fn(async () => ({
			sqlStatements: ['DROP TABLE `orders`;'],
			statements: [{ type: 'drop_table', table: 'orders' }],
			groupedStatements: [],
		})),
	}));

	const pushSinglestore = await import('../../src/cli/commands/push-singlestore');

	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushSinglestore.handle(
			['schema.ts'],
			{} as never,
			{} as never,
			false,
			false,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({ status: 'missing_hints' });
});
