import type { BindParams, Database } from 'sql.js';
import { entityKind } from '~/entity.ts';
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

export interface SQLJsSessionOptions {
	logger?: Logger;
}

export type SQLJsRunResult = void;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLJsSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'sync', SQLJsRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLJsSession';

	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: SQLJsSessionOptions = {},
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
	): SQLiteAsyncPreparedQuery<T & { run: SQLJsRunResult }> {
		const executors: SQLiteQueryExecutors<'sync'> = {
			all: (params) => {
				const stmt = this.client.prepare(query.sql);
				stmt.bind(params as BindParams);
				const rows: unknown[] = [];
				if (mode === 'arrays') {
					while (stmt.step()) {
						rows.push(stmt.get());
					}
				} else {
					while (stmt.step()) {
						rows.push(stmt.getAsObject());
					}
				}

				stmt.free();
				return rows;
			},
			get: (params) => {
				const stmt = this.client.prepare(query.sql);
				stmt.bind(params as BindParams);
				let row;
				if (stmt.step()) {
					row = mode === 'arrays' ? stmt.get() : stmt.getAsObject();
				}

				stmt.free();
				return row;
			},
			run: (params) => {
				const stmt = this.client.prepare(query.sql);
				const res = stmt.run(params as BindParams);
				stmt.free();

				return res;
			},
			values: (params) => {
				const stmt = this.client.prepare(query.sql);
				stmt.bind(params as BindParams);
				const rows: unknown[] = [];
				while (stmt.step()) {
					rows.push(stmt.get());
				}

				stmt.free();
				return rows;
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
		transaction: (tx: SQLJsTransaction<TRelations>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLJsTransaction('sync', this.dialect, this, this.relations);
		this.run(sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`));
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

export class SQLJsTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'sync', SQLJsRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLJsTransaction';

	override transaction<T>(
		transaction: (
			tx: SQLJsTransaction<TRelations>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SQLJsTransaction(
			'sync',
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
		);
		tx.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			tx.run(sql.raw(`release savepoint ${savepointName}`));
			return result as T;
		} catch (err) {
			tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}
