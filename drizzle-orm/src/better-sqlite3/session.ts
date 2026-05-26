import type { Database, RunResult } from 'better-sqlite3';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	type SQLiteQueryExecutors,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import type { DrizzleTypeError } from '~/utils.ts';

export interface BetterSQLiteSessionOptions {
	logger?: Logger;
}

export type BetterSQLite3RunResult = RunResult;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class BetterSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteSession<'sync', BetterSQLite3RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'BetterSQLiteSession';

	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private options: BetterSQLiteSessionOptions = {},
	) {
		super(dialect, 'sync');
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
	): SQLitePreparedQuery<T & { run: BetterSQLite3RunResult }> {
		let executors: SQLiteQueryExecutors<'sync'>;
		if (prepare) {
			const stmt = this.client.prepare(query.sql);
			executors = {
				all: (params) => {
					if (mode === 'arrays') return stmt.raw().all(...params as any[]);
					return stmt.all(...params as any[]);
				},
				get: (params) => {
					if (mode === 'arrays') return stmt.raw().get(...params as any[]);
					return stmt.get(...params as any[]);
				},
				run: (params) => {
					return stmt.run(...params as any[]);
				},
				values: (params) => {
					return stmt.raw().all(...params as any[]);
				},
			};
		} else {
			executors = {
				all: (params) => {
					if (mode === 'arrays') return this.client.prepare(query.sql).raw().all(...params as any[]);
					return this.client.prepare(query.sql).all(...params as any[]);
				},
				get: (params) => {
					if (mode === 'arrays') return this.client.prepare(query.sql).raw().get(...params as any[]);
					return this.client.prepare(query.sql).get(...params as any[]);
				},
				run: (params) => {
					return this.client.prepare(query.sql).run(...params as any[]);
				},
				values: (params) => {
					return this.client.prepare(query.sql).raw().all(...params as any[]);
				},
			};
		}
		return new SQLitePreparedQuery(
			'sync',
			executeMethod,
			executors,
			query,
			mapper,
			mode,
			this.logger,
			undefined,
			queryMetadata,
			undefined,
		);
	}

	override transaction<T>(
		transaction: (tx: BetterSQLiteTransaction<TRelations>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new BetterSQLiteTransaction('sync', this.dialect, this, this.relations);
		const nativeTx = this.client.transaction(transaction);
		return nativeTx[config.behavior ?? 'deferred'](tx);
	}
}

export class BetterSQLiteTransaction<TRelations extends AnyRelations>
	extends SQLiteTransaction<'sync', BetterSQLite3RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'BetterSQLiteTransaction';

	override transaction<T>(
		transaction: (
			tx: BetterSQLiteTransaction<TRelations>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new BetterSQLiteTransaction(
			'sync',
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
		);
		this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result as T;
		} catch (err) {
			this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}
