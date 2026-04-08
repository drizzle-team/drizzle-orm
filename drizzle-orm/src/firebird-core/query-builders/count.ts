import { entityKind } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { FirebirdSession } from '../session.ts';
import type { FirebirdTable } from '../table.ts';
import type { FirebirdView } from '../view.ts';

export class FirebirdCountBuilder<
	TSession extends FirebirdSession<any, any, any, any>,
> extends SQL<number> implements Promise<number>, SQLWrapper {
	private sql: SQL<number>;

	static override readonly [entityKind] = 'FirebirdCountBuilderAsync';
	[Symbol.toStringTag] = 'FirebirdCountBuilderAsync';

	private session: TSession;

	private static buildEmbeddedCount(
		source: FirebirdTable | FirebirdView | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`(select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters})`;
	}

	private static buildCount(
		source: FirebirdTable | FirebirdView | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQL<number> {
		return sql<number>`select count(*) from ${source}${sql.raw(' where ').if(filters)}${filters}`;
	}

	constructor(
		readonly params: {
			source: FirebirdTable | FirebirdView | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			session: TSession;
		},
	) {
		super(FirebirdCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);

		this.session = params.session;

		this.sql = FirebirdCountBuilder.buildCount(
			params.source,
			params.filters,
		);
	}

	then<TResult1 = number, TResult2 = never>(
		onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		return Promise.resolve(this.session.count(this.sql)).then(
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
