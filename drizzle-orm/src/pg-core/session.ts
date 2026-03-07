import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/index.ts';
import type { PgDialect } from './dialect.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	objects: unknown;
	arrays: unknown;
}

export abstract class PgBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'PgBasePreparedQuery';

	constructor(
		protected query: Query,
	) {}

	// TODO: ? why
	mapResult(_: unknown, __?: boolean): unknown {
		throw new Error('Method not implemented.');
	}

	getQuery(): Query {
		return this.query;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): unknown;

	/** @internal */
	protected abstract queryWithCache(
		queryString: string,
		params: any[],
		query: unknown,
	): unknown;
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class PgSession {
	static readonly [entityKind]: string = 'PgSession';

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects',
		name: string | boolean,
		mapper: ((rows: unknown[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgBasePreparedQuery;

	abstract execute(query: SQL): unknown;
	abstract values(query: SQL): unknown;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
