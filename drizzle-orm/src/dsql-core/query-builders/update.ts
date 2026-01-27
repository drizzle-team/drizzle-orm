import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { applyMixins, getTableLikeName, mapUpdateSet, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { DSQLViewBase } from '../view-base.ts';
import type { DSQLSelectJoinConfig, SelectedFieldsOrdered } from './select.types.ts';

export interface DSQLUpdateConfig<TTable extends DSQLTable = DSQLTable> {
	table: TTable;
	set: UpdateSet;
	where?: SQL;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
	from?: DSQLTable | Subquery | DSQLViewBase | SQL;
	joins: DSQLSelectJoinConfig[];
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

type JoinType = 'left' | 'right' | 'inner' | 'full';

export class DSQLUpdateBase<
	TTable extends DSQLTable,
	_TQueryResult,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? any : TReturning[]> implements SQLWrapper {
	static override readonly [entityKind]: string = 'DSQLUpdate';

	protected config: DSQLUpdateConfig<TTable>;
	protected joinsNotNullableMap: Record<string, boolean>;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: DSQLSession | undefined,
		private dialect: DSQLDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, set, withList, joins: [] };
		const tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof tableName === 'string' ? { [tableName]: true } : {};
	}

	/**
	 * Adds a FROM clause to the UPDATE query, allowing you to reference other tables.
	 *
	 * @example
	 * ```ts
	 * await db.update(users)
	 *   .set({ name: sql`${orders.product}` })
	 *   .from(orders)
	 *   .where(eq(users.id, orders.userId));
	 * ```
	 */
	from(source: DSQLTable | Subquery | DSQLViewBase | SQL): this {
		const tableName = getTableLikeName(source);
		if (typeof tableName === 'string') {
			this.joinsNotNullableMap[tableName] = true;
		}
		this.config.from = source;
		return this;
	}

	private createJoin(joinType: JoinType) {
		return (
			table: DSQLTable | Subquery | DSQLViewBase | SQL,
			on: SQL | undefined,
		): this => {
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new DrizzleError({ message: `Alias "${tableName}" is already used in this query` });
			}

			this.config.joins.push({
				on,
				table,
				joinType,
				alias: tableName,
			});

			if (typeof tableName === 'string') {
				switch (joinType) {
					case 'left': {
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
					case 'right': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'inner': {
						this.joinsNotNullableMap[tableName] = true;
						break;
					}
					case 'full': {
						this.joinsNotNullableMap = Object.fromEntries(
							Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]),
						);
						this.joinsNotNullableMap[tableName] = false;
						break;
					}
				}
			}

			return this;
		};
	}

	/**
	 * Executes a `left join` operation in the UPDATE query.
	 */
	leftJoin = this.createJoin('left');

	/**
	 * Executes a `right join` operation in the UPDATE query.
	 */
	rightJoin = this.createJoin('right');

	/**
	 * Executes an `inner join` operation in the UPDATE query.
	 */
	innerJoin = this.createJoin('inner');

	/**
	 * Executes a `full join` operation in the UPDATE query.
	 */
	fullJoin = this.createJoin('full');

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
			throw new DrizzleError({
				message: 'Cannot execute a query on a query builder. Please use a database instance instead.',
			});
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
