import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { TablesRelationalConfig } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import { PgDatabase } from './db.ts';
import type { PgDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';
import type { AnyPgRole } from './role.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	static readonly [entityKind]: string = 'PgPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
	rlsConfig?: {
		set?: {
			name: string;
			value: string;
			isLocal?: boolean;
		}[];
		role?: AnyPgRole;
	};
}

export abstract class PgSession<
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'PgSession';

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): PreparedQuery<T>;

	execute<T>(query: SQL): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
				);
			});

			return prepared.execute();
		});
	}

	all<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
		).all();
	}

	abstract transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgTransaction<
	TQueryResult extends QueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends PgDatabase<TQueryResult, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'PgTransaction';

	constructor(
		dialect: PgDialect,
		session: PgSession<any, any, any>,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return sql.raw(chunks.join(' '));
	}

	setTransaction(config: PgTransactionConfig): Promise<void> | void {
		if (config.accessMode || config.deferrable || config.isolationLevel) {
			return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
		}
	}

	async executeRLSConfig(config: PgTransactionConfig | undefined): Promise<void> {
		const rlsConfig = config?.rlsConfig;
		if (rlsConfig) {
			if (rlsConfig.set) {
				for (const { name, value, isLocal } of rlsConfig.set) {
					await this.session.execute(sql`select set_config(${name}, ${value}, ${isLocal === false ? false : true})`);
				}
			}

			if (rlsConfig.role) {
				await this.session.execute(sql`set local role ${rlsConfig.role}`);
			}
		}
	}

	abstract override transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface QueryResultHKT {
	readonly $brand: 'QueryRowHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type QueryResultKind<TKind extends QueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
