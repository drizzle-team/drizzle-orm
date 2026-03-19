import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { PreparedQuery } from '~/session.ts';
import { type CommentInput, type Query, type SQL, sqlCommenter } from '~/sql/index.ts';
import type { PgDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PgBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'PgBasePreparedQuery';

	private commentlessSql: string;
	private originalComment?: CommentInput;

	constructor(protected query: Query) {
		this.commentlessSql = query.sql;
		this.originalComment = query.comment;
		if (query.comment) {
			const encodedComment = sqlCommenter(query.comment);
			if (encodedComment) {
				query.sql = `${query.sql} ${encodedComment}`;
			}
		}
	}

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

	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 *
	 * If comment was already set prior to preparation - extends it
	 *
	 * If both prior and current comments are objects - they get merged
	 */
	comment(comment: CommentInput): Omit<this, 'comment'> {
		const merged = sqlCommenter.merge(this.originalComment, comment);
		this.query.sql = merged ? `${this.commentlessSql} ${merged}` : this.commentlessSql;
		return this as any;
	}
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class PgSession {
	static readonly [entityKind]: string = 'PgSession';

	constructor(protected dialect: PgDialect) {}

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
	): PgBasePreparedQuery;

	abstract prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): PgBasePreparedQuery;

	abstract execute(query: SQL): unknown;

	abstract all(query: SQL): unknown;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
