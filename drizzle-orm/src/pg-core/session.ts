import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/index.ts';
import type { PgDialect } from './dialect.ts';

export interface PreparedQueryConfig {
	execute: unknown;
}

export abstract class PgBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'PgBasePreparedQuery';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		protected query: Query,
	) {}

	getQuery(): Query {
		return this.query;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): unknown;
}

export type PgTransactionConfig =
	| {
		/** `snapshot` cannot be used with `isolationLevel: 'read uncommitted' | 'read committed'` */
		isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' | undefined;
		accessMode?: 'read only' | 'read write' | undefined;
		deferrable?: boolean | undefined;
		snapshot?: undefined;
	}
	| {
		/** `snapshot` needs `isolationLevel: 'repeatable read' | 'serializable'`: the server default, `read committed`, can't import one */
		isolationLevel: 'repeatable read' | 'serializable';
		accessMode?: 'read only' | 'read write' | undefined;
		deferrable?: boolean | undefined;
		/** Run the transaction on a snapshot exported by another transaction (`pg_export_snapshot()`) */
		snapshot: string;
	};

export abstract class PgSession {
	static readonly [entityKind]: string = 'PgSession';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper: ((rows: unknown[]) => any) | undefined,
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
		/** Usef for driver-side mapping if supported by driver & compatible */
		driverShape?: unknown,
	): PgBasePreparedQuery;

	abstract execute(query: SQL): unknown;
	abstract arrays(query: SQL): unknown;
	abstract objects(query: SQL): unknown;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export type PgRawRow<TRow> = TRow extends 'unknown' ? Record<string, unknown> : TRow;
