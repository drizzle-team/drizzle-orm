import type { DatabaseSync, SQLInputValue, StatementResultingChanges } from 'node:sqlite';
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

export interface NodeSQLiteSessionOptions {
	logger?: Logger;
}

export type NodeSQLiteRunResult = StatementResultingChanges;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class NodeSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'sync', NodeSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLJsSession';

	private logger: Logger;

	constructor(
		private client: DatabaseSync,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: NodeSQLiteSessionOptions = {},
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
	): SQLiteAsyncPreparedQuery<T & { run: NodeSQLiteRunResult }> {
		let stmt: ReturnType<typeof this.client.prepare>;
		try {
			stmt = this.client.prepare(query.sql);
		} catch (e) {
			throw new DrizzleQueryError(query.sql, query.params, e as Error);
		}

		const executors: SQLiteQueryExecutors<'sync'> = {
			all: (params) => {
				stmt.setReturnArrays(mode === 'arrays');
				const res = stmt.all(...params as SQLInputValue[]);

				// Null-prototype object => object
				if (mode === 'objects') return res.map((row) => ({ ...row }));
				return res;
			},
			get: (params) => {
				stmt.setReturnArrays(mode === 'arrays');
				const res = stmt.get(...params as SQLInputValue[]);

				// Null-prototype object => object
				if (res && mode === 'objects') return { ...res };
				return res;
			},
			run: (params) => {
				stmt.setReturnArrays(false);
				return stmt.run(...params as SQLInputValue[]);
			},
			values: (params) => {
				stmt.setReturnArrays(true);
				return stmt.all(...params as SQLInputValue[]);
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
		transaction: (tx: NodeSQLiteTransaction<TRelations>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new NodeSQLiteTransaction('sync', this.dialect, this, this.relations);
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

export class NodeSQLiteTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'sync', StatementResultingChanges, TRelations>
{
	static override readonly [entityKind]: string = 'SQLJsTransaction';

	override transaction<T>(
		transaction: (
			tx: NodeSQLiteTransaction<TRelations>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeSQLiteTransaction(
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
