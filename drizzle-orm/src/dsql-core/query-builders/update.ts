import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { applyMixins, mapUpdateSet, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface DSQLUpdateConfig<TTable extends DSQLTable = DSQLTable> {
	table: TTable;
	set: UpdateSet;
	where?: SQL;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type SelectedFieldsFlat = Record<string, unknown>;

export class DSQLUpdateBuilder<TTable extends DSQLTable> {
	static readonly [entityKind]: string = 'DSQLUpdateBuilder';

	constructor(
		private table: TTable,
		private session: DSQLSession | undefined,
		private dialect: DSQLDialect,
		private withList?: Subquery[],
	) {}

	set(values: Record<string, unknown>): DSQLUpdateBase<TTable, any, any> {
		return new DSQLUpdateBase(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		);
	}
}

export interface DSQLUpdateBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends DSQLTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_TQueryResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? any : TReturning[]>, SQLWrapper {}

export class DSQLUpdateBase<
	TTable extends DSQLTable,
	_TQueryResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? any : TReturning[]> implements SQLWrapper {
	static override readonly [entityKind]: string = 'DSQLUpdate';

	protected config: DSQLUpdateConfig<TTable>;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: DSQLSession | undefined,
		private dialect: DSQLDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, set, withList };
	}

	where(where: SQL | undefined): this {
		this.config.where = where;
		return this;
	}

	returning(fields?: SelectedFieldsFlat): DSQLUpdateBase<TTable, any, any> {
		const returningFields = fields ?? this.config.table[Table.Symbol.Columns];
		this.config.returning = orderSelectedFields<DSQLColumn>(returningFields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
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
			undefined,
			{
				type: 'update',
				tables: [this.config.table[Table.Symbol.Name]],
			},
		);
	}

	prepare(name: string) {
		return this._prepare(name);
	}

	override execute(): Promise<any> {
		return this._prepare().execute() as Promise<any>;
	}

	override then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.execute().then(onfulfilled, onrejected);
	}

	$dynamic(): this {
		return this;
	}
}

applyMixins(DSQLUpdateBase, [QueryPromise]);
