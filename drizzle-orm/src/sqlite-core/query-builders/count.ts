import { entityKind, sql } from '~/index.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { SQL } from '~/sql/sql.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SQLiteSession } from '../session.ts';
import type { SQLiteTable } from '../table.ts';

export class SQLiteCountBuilderAsync<
	TSession extends SQLiteSession<'async' | 'sync', any, any, any>,
> extends SQL<number> implements Promise<number>, SQLWrapper {
	private sql: SQL<number>;

	static readonly [entityKind] = 'SQLiteCountBuilderAsync';
	[Symbol.toStringTag] = 'SQLiteCountBuilderAsync';

	private session: TSession;

	private static buildEmbeddedCount(
		source: SQLiteTable | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`(select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters})`;
	}

	private static buildCount(
		source: SQLiteTable | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters}`;
	}

	constructor(
		readonly params: {
			source: SQLiteTable | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: SQLiteDialect;
			session: TSession;
		},
	) {
		super(SQLiteCountBuilderAsync.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.session = params.session;

		this.sql = SQLiteCountBuilderAsync.buildCount(
			params.source,
			params.filters,
		);
	}

	then<TResult1 = number, TResult2 = never>(
		onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		return Promise.resolve(this.session.values(this.sql)).then<number>((it) => it![0]![0] as number).then(
			onfulfilled,
			onrejected,
		);
	}

	catch(
		onRejected?: ((reason: any) => never | PromiseLike<never>) | null | undefined,
	): Promise<number> {
		return this.then(undefined, onRejected);
	}

	finally(onFinally?: (() => void) | null | undefined): Promise<number> {
		return this.then(
			(value) => {
				onFinally?.();
				return value;
			},
			(reason) => {
				onFinally?.();
				throw reason;
			},
		);
	}
}
