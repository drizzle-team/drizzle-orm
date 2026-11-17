import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { EffectTransactionRollbackError, MigratorInitError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase, QueryEffectKind } from '~/effect-core/query-effect.ts';
import { effectQueryRuntime } from '~/effect-core/query-runtime.ts';
import { entityKind } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { QueryRuntime } from '~/query-runtime.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	type PreparedQueryConfig,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	SQLiteSession,
} from '~/sqlite-core/session.ts';
import { upgradeIfNeeded } from '~/up-migrations/effect-sqlite.ts';
import { SQLiteEffectDatabase } from './db.ts';

export type SQLiteEffectQueryExecutors = Record<
	// `values` mirrors `all` in array mode, no need to define separate executor
	Exclude<SQLiteExecuteMethod, 'values'>,
	(params: unknown[]) => Effect.Effect<any, unknown, unknown>
>;

export interface SQLiteEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> {
	run(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['run']>;
	all(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['all']>;
	get(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['get']>;
	values(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['values']>;
	execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['execute']>;
}

export class SQLiteEffectPreparedQuery<
	// oxlint-disable-next-line no-unused-vars
	T extends PreparedQueryConfig,
	// oxlint-disable-next-line no-unused-vars
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLitePreparedQuery {
	static override readonly [entityKind]: string = 'SQLiteEffectPreparedQuery';

	/** @internal */
	override get runtime(): QueryRuntime {
		return effectQueryRuntime;
	}

	constructor(
		executeMethod: SQLiteExecuteMethod = 'all',
		executors: SQLiteEffectQueryExecutors,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: EffectLoggerShape,
		paramsInErrors: boolean | undefined,
	) {
		super(executeMethod, executors, query, mapper, mode, logger, paramsInErrors);
	}
}

export interface SQLiteEffectSession<
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	// oxlint-disable-next-line no-unused-vars
	TRelations extends AnyRelations = EmptyRelations,
> {
	run(query: SQL): QueryEffectKind<TEffectHKT, TRunResult>;
	objects<T = unknown>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	object<T = unknown>(query: SQL): QueryEffectKind<TEffectHKT, T>;
	arrays<T extends any[] = unknown[]>(query: SQL): QueryEffectKind<TEffectHKT, T[]>;
	array<T extends any[] = unknown[]>(query: SQL): QueryEffectKind<TEffectHKT, T>;
}

export abstract class SQLiteEffectSession<
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteSession<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectSession';

	/** @internal */
	override get runtime(): QueryRuntime {
		return effectQueryRuntime;
	}

	declare readonly dialect: SQLiteDialect;

	constructor(dialect: SQLiteDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
	): SQLiteEffectPreparedQuery<T, TEffectHKT>;

	abstract transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class SQLiteEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectTransaction';

	constructor(
		dialect: SQLiteDialect,
		session: SQLiteEffectSession<any, TEffectHKT, any>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		forbidJsonb?: boolean,
	) {
		super(dialect, session, relations, forbidJsonb);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: SQLiteEffectSession<any, TEffectHKT>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
) {
	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: (config.migrationsTable ?? '__drizzle_migrations');

	const { newDb } = yield* upgradeIfNeeded(migrationsTable, session, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id INTEGER PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric,
				name text,
				applied_at TEXT
			)
		`;
		yield* session.run(migrationTableCreate);
	}

	const dbMigrations = yield* session.objects<{
		id: number;
		hash: string;
		created_at: string;
		name: string | null;
	}>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)};`,
	);

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) {
			return yield* new MigratorInitError({ exitCode: 'databaseMigrations' });
		}

		if (migrations.length > 1) {
			return yield* new MigratorInitError({ exitCode: 'localMigrations' });
		}

		const [migration] = migrations;

		if (!migration) return;

		yield* session.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({
		localMigrations: migrations,
		dbMigrations,
	});

	yield* session.transaction((tx) =>
		Effect.gen(function*() {
			for (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					yield* tx.run(sql.raw(stmt));
				}
				yield* tx.run(
					sql`insert into ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
						new Date().toISOString()
					})`,
				);
			}
		})
	);
});
