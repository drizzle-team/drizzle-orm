import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { applyMixins, orderSelectedFields } from '~/utils.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface DSQLDeleteConfig<TTable extends DSQLTable = DSQLTable> {
	table: TTable;
	where?: SQL;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type SelectedFieldsFlat = Record<string, unknown>;

export interface DSQLDeleteBase<
	_TTable extends DSQLTable,
	_TQueryResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? any : TReturning[]>, SQLWrapper {}

export class DSQLDeleteBase<
	TTable extends DSQLTable,
	_TQueryResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? any : TReturning[]> implements SQLWrapper {
	static readonly [entityKind]: string = 'DSQLDelete';

	protected config: DSQLDeleteConfig<TTable>;

	constructor(
		table: TTable,
		private session: DSQLSession | undefined,
		private dialect: DSQLDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, withList };
	}

	where(where: SQL | undefined): this {
		this.config.where = where;
		return this;
	}

	returning(fields?: SelectedFieldsFlat): DSQLDeleteBase<TTable, any, any> {
		const returningFields = fields ?? this.config.table[Table.Symbol.Columns];
		this.config.returning = orderSelectedFields<DSQLColumn>(returningFields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): { sql: string; params: unknown[] } {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string) {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		return this.session.prepareQuery<any>(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			name,
			true,
		);
	}

	prepare(name: string) {
		return this._prepare(name);
	}

	override execute(): Promise<any> {
		return this._prepare().execute();
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.execute().then(onfulfilled, onrejected);
	}

	$dynamic(): this {
		return this;
	}
}

applyMixins(DSQLDeleteBase, [QueryPromise]);
