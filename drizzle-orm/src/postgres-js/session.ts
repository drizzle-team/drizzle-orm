import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import { pgRawTextOids } from '~/pg-core/codecs.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig } from '~/pg-core/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import { type Assume, decodeUtf8 } from '~/utils.ts';

interface PostgresJsColumn {
	name: string;
	type: number;
	parser?: (((value: string) => unknown) & { array?: boolean }) | null;
}

/**
 * `postgres.js` has no per-query parser options, so queries decoded by codecs (queries with a mapper) are executed in
 * `raw` mode and decoded here: `pgRawTextOids` stay text for codecs to decode, other columns go through the client's own
 * parsers and value transform exactly as `postgres.js` applies them in non-raw modes. Proxy servers apply it to such
 * queries as well
 * @param mode - `objects` keys rows by column names
 */
export function decodePostgresJsRawRows(
	client: Sql | TransactionSql,
	rows: ArrayLike<ArrayLike<Uint8Array | null>>,
	mode: 'arrays' | 'objects' = 'arrays',
): unknown[][] | Record<string, unknown>[] {
	const columns = (rows as unknown as { columns: PostgresJsColumn[] }).columns;
	// transaction clients have no `options`
	const valueFrom = (client as {
		options?: { transform?: { value?: { from?: (value: unknown, column: unknown) => unknown } } };
	}).options?.transform?.value?.from;
	const decoders = columns.map((column): (value: Uint8Array | null) => unknown => {
		if (pgRawTextOids.has(column.type)) return (value) => value === null ? null : decodeUtf8(value);

		// `postgres.js` 3 leaves columns without a parser `undefined`, 4 sets them to `null`
		const { parser } = column;
		const parse: (value: Uint8Array) => unknown = !parser
			? (value) => decodeUtf8(value)
			: parser.array === true
			// `postgres.js` array parsers expect the literal without it's opening brace
			? (value) => parser(decodeUtf8(value.subarray(1)))
			: (value) => parser(decodeUtf8(value));

		return valueFrom
			? (value) => valueFrom(value === null ? null : parse(value), column)
			: (value) => value === null ? null : parse(value);
	});

	const { length } = rows;
	if (mode === 'objects') {
		const out: Record<string, unknown>[] = new Array(length);
		for (let i = 0; i < length; ++i) {
			const row = rows[i]!;
			const decoded: Record<string, unknown> = {};
			for (let j = 0; j < row.length; ++j) decoded[columns[j]!.name] = decoders[j]!(row[j]!);
			out[i] = decoded;
		}

		return out;
	}

	const out: unknown[][] = new Array(length);
	for (let i = 0; i < length; ++i) {
		const row = rows[i]!;
		const decoded: unknown[] = new Array(row.length);
		for (let j = 0; j < row.length; ++j) decoded[j] = decoders[j]!(row[j]!);
		out[i] = decoded;
	}

	return out;
}

export interface PostgresJsSessionOptions {
	logger?: Logger;
	cache?: Cache;
	paramsInErrors?: boolean;
}

export class PostgresJsSession<TSQL extends Sql | TransactionSql, TRelations extends AnyRelations>
	extends PgAsyncSession<PostgresJsQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'PostgresJsSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private relations: TRelations,
		/** @internal */
		readonly options: PostgresJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
	) {
		const executor = async (params?: unknown[]) => {
			if (mapper) {
				return this.client.unsafe(query.sql, params ?? [] as any[], {
					prepare: name !== false,
				}).raw().then((rows) => decodePostgresJsRawRows(this.client, rows, mode === 'objects' ? 'objects' : 'arrays'));
			}
			if (mode === 'objects') {
				return this.client.unsafe(query.sql, params ?? [] as any[], {
					prepare: name !== false,
				}).then((rows) => Object.values(rows));
			}
			if (mode === 'raw') {
				return this.client.unsafe(query.sql, params ?? [] as any[], {
					prepare: name !== false,
				});
			}
			return this.client.unsafe(query.sql, params ?? [] as any[], {
				prepare: name !== false,
			}).values().then((rows) => Object.values(rows));
		};

		return new PgAsyncPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			this.options.paramsInErrors,
		);
	}
	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TRelations>(
				client,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new PostgresJsTransaction(this.dialect, session, this.relations);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresJsQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresJsTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql, TRelations>,
		relations: TRelations,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, nestedIndex, false);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TRelations>(
				client,
				this.dialect,
				this._.relations,
				this.session.options,
			);
			const tx = new PostgresJsTransaction<TRelations>(
				this.dialect,
				session,
				this._.relations,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export type PostgresJsRawExecuteResult = RowList<Record<string, unknown>[]> | RowList<Record<string, unknown>[]>[];

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: [this['row']] extends [never] ? RowList<never[]>
		: [this['row']] extends ['unknown'] ? PostgresJsRawExecuteResult
		: RowList<Assume<this['row'], Row>[]>;
}
