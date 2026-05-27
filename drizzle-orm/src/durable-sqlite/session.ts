import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import { type SQLiteSyncDialect, SQLiteTransaction } from '~/sqlite-core/index.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	type SQLiteQueryExecutors,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import type { DrizzleTypeError } from '~/utils.ts';

export interface SQLiteDOSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export type DurableSQLiteRunResult = SqlStorageCursor<Record<string, SqlStorageValue>>;

export class SQLiteDOSession<TRelations extends AnyRelations> extends SQLiteSession<
	'sync',
	DurableSQLiteRunResult,
	TRelations
> {
	static override readonly [entityKind]: string = 'SQLiteDOSession';

	private logger: Logger;

	constructor(
		private client: DurableObjectStorage,
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private options: SQLiteDOSessionOptions = {},
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
	): SQLitePreparedQuery<T & { run: DurableSQLiteRunResult }> {
		const executors: SQLiteQueryExecutors<'sync'> = {
			all: (params) => {
				const res = params.length > 0
					? this.client.sql.exec(query.sql, ...params)
					: this.client.sql.exec(query.sql);

				if (mode === 'objects') return res.toArray();
				// @ts-ignore .raw().toArray() exists
				return res.raw().toArray();
			},
			get: (params) => {
				const res = params.length > 0
					? this.client.sql.exec(query.sql, ...params)
					: this.client.sql.exec(query.sql);

				if (mode === 'objects') return res.one();

				return res.raw().next().value;
			},
			run: (params) => {
				return params.length > 0
					? this.client.sql.exec(query.sql, ...params)
					: this.client.sql.exec(query.sql);
			},
			values: (params) => {
				const res = params.length > 0
					? this.client.sql.exec(query.sql, ...params)
					: this.client.sql.exec(query.sql);

				// @ts-ignore .raw().toArray() exists
				return res.raw().toArray();
			},
		};

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
		transaction: (
			tx: SQLiteTransaction<
				'sync',
				DurableSQLiteRunResult,
				TRelations
			>,
		) => T,
		_config?: SQLiteTransactionConfig,
	): T {
		const tx = new SQLiteDOTransaction('sync', this.dialect, this, this.relations, undefined, false, true);
		return this.client.transactionSync(() => transaction(tx));
	}
}

export class SQLiteDOTransaction<TRelations extends AnyRelations>
	extends SQLiteTransaction<'sync', DurableSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteDOTransaction';

	override transaction<T>(
		transaction: (
			tx: SQLiteDOTransaction<TRelations>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const tx = new SQLiteDOTransaction(
			'sync',
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
			false,
			true,
		);
		return this.session.transaction(() => transaction(tx)) as T;
	}
}
