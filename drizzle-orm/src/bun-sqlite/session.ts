/// <reference types="bun-types" />

import type { Changes, Database } from 'bun:sqlite';
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

export interface SQLiteBunSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type SQLiteBunRunResult = Changes;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteBunSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'sync', SQLiteBunRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteBunSession';

	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: SQLiteBunSessionOptions = {},
	) {
		super(dialect, 'sync');
		this.logger = options.logger ?? new NoopLogger();
	}

	exec(query: string): void {
		this.client.exec(query);
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
	): SQLiteAsyncPreparedQuery<T & { run: SQLiteBunRunResult }> {
		let stmt: ReturnType<typeof this.client.query>;
		try {
			stmt = this.client.query(query.sql);
		} catch (e) {
			throw new DrizzleQueryError(query.sql, query.params, e as Error);
		}
		const executors: SQLiteQueryExecutors<'sync'> = {
			all: (params) => {
				if (mode === 'arrays') return stmt.values(...params as any[]);
				return stmt.all(...params as any[]);
			},
			get: (params) => {
				if (mode === 'arrays') return stmt.values(...params as any[])[0];
				return stmt.get(...params as any[]);
			},
			run: (params) => {
				return stmt.run(...params as any[]);
			},
			values: (params) => {
				return stmt.values(...params as any[]);
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
		transaction: (tx: SQLiteBunTransaction<TRelations>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLiteBunTransaction('sync', this.dialect, this, this.relations);
		let result: T | undefined;
		const nativeTx = this.client.transaction(() => {
			result = transaction(tx);
		});
		nativeTx[config.behavior ?? 'deferred']();
		return result!;
	}
}

export class SQLiteBunTransaction<
	TRelations extends AnyRelations,
> extends SQLiteAsyncTransaction<'sync', SQLiteBunRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteBunTransaction';

	override transaction<T>(
		transaction: (
			tx: SQLiteBunTransaction<TRelations>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteBunTransaction(
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
