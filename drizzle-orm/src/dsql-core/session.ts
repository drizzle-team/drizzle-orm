import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/index.ts';
import type { DSQLDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class DSQLBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'DSQLBasePreparedQuery';

	constructor(protected query: Query) {}

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;

	abstract execute(placeholderValues?: Record<string, unknown>): unknown;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): unknown;

	/** @internal */
	protected abstract queryWithCache(
		queryString: string,
		params: any[],
		query: unknown,
	): unknown;
}

export interface DSQLTransactionConfig {
	// DSQL only supports repeatable read isolation level
	isolationLevel?: 'repeatable read';
	accessMode?: 'read only' | 'read write';
}

export abstract class DSQLSession {
	static readonly [entityKind]: string = 'DSQLSession';

	constructor(protected dialect: DSQLDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): DSQLBasePreparedQuery;

	abstract prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): DSQLBasePreparedQuery;

	abstract execute(query: SQL): unknown;

	abstract all(query: SQL): unknown;
}

export interface DSQLQueryResultHKT {
	readonly $brand: 'DSQLQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type DSQLQueryResultKind<TKind extends DSQLQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
