import { entityKind } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { ClickHouseSession } from '../session.ts';
import type { ClickHouseTable } from '../table.ts';
/* import type { ClickHouseViewBase } from '../view-base.ts'; */

export class ClickHouseCountBuilder<
	TSession extends ClickHouseSession<any, any>,
> extends SQL<number> implements Promise<number>, SQLWrapper {
	private sql: SQL<number>;

	static override readonly [entityKind] = 'ClickHouseCountBuilder';
	[Symbol.toStringTag] = 'ClickHouseCountBuilder';

	private session: TSession;

	private static buildEmbeddedCount(
		source: ClickHouseTable | /* ClickHouseViewBase | */ SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`(select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters})`;
	}

	private static buildCount(
		source: ClickHouseTable | /* ClickHouseViewBase | */ SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`select count(*) as count from ${source}${sql.raw(' where ').if(filters)}${filters}`;
	}

	constructor(
		readonly params: {
			source: ClickHouseTable | /* ClickHouseViewBase | */ SQL | SQLWrapper;
			filters?: SQL<unknown>;
			session: TSession;
		},
	) {
		super(ClickHouseCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.mapWith(Number);

		this.session = params.session;

		this.sql = ClickHouseCountBuilder.buildCount(
			params.source,
			params.filters,
		);
	}

	then<TResult1 = number, TResult2 = never>(
		onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		return Promise.resolve(this.session.count(this.sql))
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
