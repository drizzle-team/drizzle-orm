import type { DatabaseSync, SQLInputValue, StatementResultingChanges } from 'node:sqlite';
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
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLiteSession } from '~/sqlite-core/session.ts';
import type { DrizzleTypeError } from '~/utils.ts';

export interface NodeSQLiteSessionOptions {
	logger?: Logger;
}

export type NodeSQLiteRunResult = StatementResultingChanges;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class NodeSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteSession<'sync', NodeSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLJsSession';

	private logger: Logger;

	constructor(
		private client: DatabaseSync,
		dialect: SQLiteSyncDialect,
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
	): SQLitePreparedQuery<T & { run: NodeSQLiteRunResult }> {
		const stmt = this.client.prepare(query.sql);
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
	extends SQLiteTransaction<'sync', StatementResultingChanges, TRelations>
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
