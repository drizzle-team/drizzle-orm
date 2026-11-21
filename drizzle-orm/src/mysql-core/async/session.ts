import { entityKind } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { asyncMigrationRunner, asyncQueryRuntime, runAsyncProgram } from '~/runtime/async.ts';
import type { QueryRuntime } from '~/runtime/core.ts';
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/mysql-program.ts';
import type { MySqlDialect } from '../dialect.ts';
import {
	type AnyMySqlMapper,
	MySqlBasePreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlQueryResultHKT,
	type MySqlRuntimeHKT,
	MySqlSession,
	type MySqlTransactionConfig,
} from '../session.ts';
import { MySqlAsyncDatabase } from './db.ts';

type MySqlAsyncPreparedQueryOf<TResult, TRow> = MySqlAsyncPreparedQuery<
	MySqlPreparedQueryConfig & { execute: TResult; iterator: TRow }
>;

/** Builders of the async runtime run as Promises */
export interface MySqlAsyncRuntimeHKT extends MySqlRuntimeHKT {
	readonly execute: Promise<this['result']>;
	readonly prepared: MySqlAsyncPreparedQueryOf<this['result'], this['row']>;
}

export interface MySqlAsyncPreparedQuery<T extends MySqlPreparedQueryConfig> {
	/** Runs the query with values for it's placeholders and returns a Promise of the result */
	execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
}

export class MySqlAsyncPreparedQuery<T extends MySqlPreparedQueryConfig> extends MySqlBasePreparedQuery {
	static override readonly [entityKind]: string = 'MySqlAsyncPreparedQuery';

	/** @internal */
	override get runtime(): QueryRuntime {
		return asyncQueryRuntime;
	}

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		protected _iterator: ((params?: unknown[]) => AsyncGenerator<any[]>) | undefined,
		query: Query,
		mapper:
			| AnyMySqlMapper
			| undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: Logger,
		paramsInErrors?: boolean | undefined,
	) {
		super(executor, query, mapper, mode, logger, paramsInErrors);
	}

	async *iterator(placeholderValues: Record<string, unknown> = {}): AsyncGenerator<T['iterator']> {
		const { query, logger, _iterator, mapper } = this;
		const executor = this.executor as (params?: unknown[]) => Promise<any>;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (_iterator) {
			try {
				if (mapper) {
					for await (const row of _iterator(params)) {
						yield (mapper([row])[0]);
					}

					return;
				}

				for await (const row of _iterator(params)) {
					yield row as Awaited<T['iterator']>;
				}

				return;
			} catch (e) {
				throw new DrizzleQueryError(sql, this.paramsInErrors ? params : undefined, e as Error);
			}
		}

		// Fallback for compatibility between drivers
		const rows = await executor(params).catch((e) => {
			throw new DrizzleQueryError(sql, this.paramsInErrors ? params : undefined, e as Error);
		});

		if (mapper) {
			for (const row of rows) {
				yield mapper([row])[0];
			}

			return;
		}

		for (const row of rows) {
			yield row;
		}

		return;
	}
}

export interface MySqlAsyncSession<
	// oxlint-disable-next-line no-unused-vars
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	// oxlint-disable-next-line no-unused-vars
	TRelations extends AnyRelations = EmptyRelations,
> {
	execute<T>(query: SQL): Promise<T>;
	arrays<T>(query: SQL): Promise<T[]>;
	objects<T>(query: SQL): Promise<T[]>;
}

export abstract class MySqlAsyncSession<
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlSession {
	static override readonly [entityKind]: string = 'MySqlAsyncSession';

	/** @internal */
	override get runtime(): QueryRuntime {
		return asyncQueryRuntime;
	}

	abstract override prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
	): MySqlAsyncPreparedQuery<T>;

	abstract transaction<T>(
		transaction: (
			tx: MySqlAsyncTransaction<TQueryResult, TRelations>,
		) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T>;
}

export abstract class MySqlAsyncTransaction<
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'MySqlAsyncTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlAsyncSession,
		protected relations: TRelations,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session, relations);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (
			tx: MySqlAsyncTransaction<TQueryResult, TRelations>,
		) => Promise<T>,
	): Promise<T>;
}

/** Applies the migrations that the database doesn't have yet, in a transaction */
export function migrate(
	migrations: MigrationMeta[],
	db: MySqlAsyncDatabase<MySqlQueryResultHKT, any>,
	config: Omit<MigrationConfig, 'migrationsSchema'>,
): Promise<void | MigratorInitFailResponse> {
	const runner = asyncMigrationRunner({
		execute: (query) => db.session.execute(query),
		objects: (query) => db.session.objects(query),
		transaction: (transaction) => db.transaction(transaction),
	});

	return runAsyncProgram(() => migrateProgram(migrations, runner, config));
}
