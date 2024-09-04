import { entityKind, sql } from '~/index.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { SQL } from '~/sql/sql.ts';
import type { MySqlDialect } from '../dialect.ts';
import type { MySqlSession } from '../session.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';

export class MySqlCountBuilder<
	TSession extends MySqlSession<any, any, any>,
> extends SQL<number> implements Promise<number>, SQLWrapper {
	private sql: SQL<number>;

	static readonly [entityKind] = 'MySqlCountBuilder';
	[Symbol.toStringTag] = 'MySqlCountBuilder';

	private session: TSession;

	private static buildEmbeddedCount(
		source: MySqlTable | MySqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`(select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters})`;
	}

	private static buildCount(
		source: MySqlTable | MySqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`select cast(count(*) as UNSIGNED) as count from ${source}${
			sql.raw(' where ').if(filters)
		}${filters}`;
	}

	constructor(
		readonly params: {
			source: MySqlTable | MySqlViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: MySqlDialect;
			session: TSession;
		},
	) {
		super(MySqlCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.session = params.session;

		this.sql = MySqlCountBuilder.buildCount(
			params.source,
			params.filters,
		);
	}

	then<TResult1 = number, TResult2 = never>(
		onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		return Promise.resolve(this.session.execute(this.sql)).then<number>((it) => {
			return (<[{ count: number }]> it)[0]['count'];
		})
			.then(
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
