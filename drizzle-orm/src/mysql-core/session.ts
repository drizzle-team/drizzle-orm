import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { MySqlDialect } from './dialect.ts';

export interface MySqlQueryResultHKT {
	readonly $brand: 'MySqlQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyMySqlQueryResultHKT extends MySqlQueryResultHKT {
	readonly type: any;
}

export type MySqlQueryResultKind<TKind extends MySqlQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface MySqlPreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface MySqlPreparedQueryHKT {
	readonly $brand: 'MySqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type AnyMySqlMapper = (
	response: Record<string, unknown>[] | unknown[][] | { insertId: number; affectedRows: number },
) => any;

export abstract class MySqlBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'MySqlBasePreparedQuery';

	constructor(
		protected query: Query,
	) {}

	getQuery(): Query {
		return this.query;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): unknown;
}

export interface MySqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class MySqlSession {
	static readonly [entityKind]: string = 'MySqlSession';

	constructor(protected dialect: MySqlDialect) {}

	abstract prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlBasePreparedQuery;

	abstract execute(query: SQL): unknown;

	abstract arrays(query: SQL): unknown;

	abstract objects(query: SQL): unknown;

	protected getSetTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.withConsistentSnapshot) {
			parts.push('with consistent snapshot');
		}

		if (config.accessMode) {
			parts.push(config.accessMode);
		}

		return parts.length ? sql`start transaction ${sql.raw(parts.join(' '))}` : undefined;
	}
}
