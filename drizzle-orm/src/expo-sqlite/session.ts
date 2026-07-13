import type { SQLiteDatabase, SQLiteRunResult, SQLiteStatement } from 'expo-sqlite';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import {
	SQLiteAsyncPreparedQuery,
	type SQLiteAsyncPreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteAsyncSession,
	SQLiteAsyncTransaction,
	type SQLiteQueryExecutors,
} from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteExecuteMethod, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { DrizzleTypeError } from '~/utils.ts';

export interface ExpoSQLiteSessionOptions {
	logger?: Logger;
}

export type ExpoSQLiteRunResult = SQLiteRunResult;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class ExpoSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'sync', ExpoSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteSession';

	private logger: Logger;

	constructor(
		private client: SQLiteDatabase,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: ExpoSQLiteSessionOptions = {},
	) {
		super(dialect, 'sync');
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
	): SQLiteAsyncPreparedQuery<T & { run: ExpoSQLiteRunResult }> {
		let stmt: SQLiteStatement;
		try {
			stmt = this.client.prepareSync(query.sql);
		} catch (e) {
			throw new DrizzleQueryError(query.sql, query.params, e as Error);
		}

		const executors: SQLiteQueryExecutors<'sync'> = {
			all: (params) => {
				if (mode === 'arrays') return stmt.executeForRawResultSync(params as any[]).getAllSync();
				return stmt.executeSync(params as any[]).getAllSync();
			},
			get: (params) => {
				if (mode === 'arrays') return stmt.executeForRawResultSync(params as any[]).getFirstSync();
				return stmt.executeSync(params as any[]).getFirstSync();
			},
			run: (params) => {
				const res = stmt.executeSync(params as any[]);
				return {
					changes: res.changes,
					lastInsertRowId: res.lastInsertRowId,
				};
			},
			values: (params) => {
				return stmt.executeForRawResultSync(params as any[]).getAllSync();
			},
		};

		return new SQLiteAsyncPreparedQuery(
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
		transaction: (tx: ExpoSQLiteTransaction<TRelations>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new ExpoSQLiteTransaction('sync', this.dialect, this, this.relations);
		this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = transaction(tx);
			this.run(sql`commit`);
			return result;
		} catch (err) {
			this.run(sql`rollback`);
			throw err;
		}
	}
}

export class ExpoSQLiteTransaction<
	TRelations extends AnyRelations,
> extends SQLiteAsyncTransaction<'sync', ExpoSQLiteRunResult, TRelations> {
	static override readonly [entityKind]: string = 'ExpoSQLiteTransaction';

	override transaction<T>(
		transaction: (
			tx: ExpoSQLiteTransaction<TRelations>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new ExpoSQLiteTransaction(
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
