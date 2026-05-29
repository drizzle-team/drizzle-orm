import type { DatabasePromise } from '@tursodatabase/database-common';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import { SQLiteAsyncTransaction } from '~/sqlite-core/async/session.ts';
import {
	SQLiteAsyncPreparedQuery,
	type SQLiteAsyncPreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteAsyncSession,
} from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteExecuteMethod, SQLiteQueryExecutors, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { TursoDatabaseRunResult } from './driver-core.ts';

export interface TursoDatabaseSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class TursoDatabaseSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'async', TursoDatabaseRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: DatabasePromise,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: TursoDatabaseSessionOptions,
	) {
		super(dialect, 'async');
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
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
		cacheConfig?: WithCacheConfig,
	): SQLiteAsyncPreparedQuery<T & { run: TursoDatabaseRunResult }> {
		let stmt: ReturnType<typeof this.client.prepare>;
		try {
			stmt = this.client.prepare(query.sql);
		} catch (e) {
			throw new DrizzleQueryError(query.sql, query.params, e as Error);
		}

		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => stmt.raw(mode === 'arrays').all(...params),
			get: (params) => stmt.raw(mode === 'arrays').get(...params),
			run: (params) => stmt.raw(mode === 'arrays').run(...params),
			values: (params) => stmt.raw(true).all(...params),
		};

		return new SQLiteAsyncPreparedQuery(
			'async',
			executeMethod,
			executors,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override async transaction<T>(
		transaction: (db: TursoDatabaseTransaction<TRelations>) => Promise<T>,
		_config?: SQLiteTransactionConfig,
		tx?: TursoDatabaseTransaction<TRelations>,
	): Promise<T> {
		const session = new TursoDatabaseSession<TRelations>(
			this.client,
			this.dialect,
			this.relations,
			this.options,
		);
		const localTx = tx ?? new TursoDatabaseTransaction<TRelations>(
			'async',
			this.dialect,
			session,
			this.relations,
		);

		const clientTx = this.client.transaction(async () => await transaction(localTx));

		const result = await clientTx();
		return result;
	}
}

export class TursoDatabaseTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', TursoDatabaseRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseTransaction';

	override async transaction<T>(
		_transaction: (tx: TursoDatabaseTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		// Not supported by driver
		throw new Error('Nested transactions are not supported');

		// const savepointName = `sp${this.nestedIndex}`;

		// const tx = new TursoDatabaseTransaction(
		// 	'async',
		// 	this.dialect,
		// 	this.session,
		// 	this.relations,
		// 	this.schema,
		// 	this.nestedIndex + 1,
		// );

		// await this.session.run(sql.raw(`savepoint ${savepointName}`));
		// try {
		// 	const result = await (<TursoDatabaseSession<TRelations>> (this.session)).transaction(
		// 		transaction,
		// 		undefined,
		// 		tx,
		// 	);
		// 	await this.session.run(sql.raw(`release savepoint ${savepointName}`));
		// 	return result;
		// } catch (err) {
		// 	await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
		// 	throw err;
		// }
	}
}
