import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { applyMixins, mapUpdateSet, orderSelectedFields } from '~/utils.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLQueryResultHKT, DSQLQueryResultKind, DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface DSQLInsertConfig<TTable extends DSQLTable = DSQLTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | SQL;
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
	select?: boolean;
}

export type SelectedFieldsFlat = Record<string, unknown>;

export class DSQLInsertBuilder<TTable extends DSQLTable> {
	static readonly [entityKind]: string = 'DSQLInsertBuilder';

	constructor(
		private table: TTable,
		private session: DSQLSession | undefined,
		private dialect: DSQLDialect,
		private withList?: Subquery[],
	) {}

	values(values: Record<string, unknown> | Record<string, unknown>[]): DSQLInsertBase<TTable, any, any> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new DrizzleError({ message: 'values() must be called with at least one value' });
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});

		return new DSQLInsertBase(
			this.table,
			mappedValues,
			this.session,
			this.dialect,
			this.withList,
		);
	}
}

export interface DSQLInsertBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends DSQLTable,
	TQueryResult extends DSQLQueryResultHKT,
	TReturning = undefined,
> extends
	QueryPromise<TReturning extends undefined ? DSQLQueryResultKind<TQueryResult, never> : TReturning[]>,
	SQLWrapper
{}

export class DSQLInsertBase<
	TTable extends DSQLTable,
	TQueryResult extends DSQLQueryResultHKT,
	TReturning = undefined,
> extends QueryPromise<TReturning extends undefined ? DSQLQueryResultKind<TQueryResult, never> : TReturning[]>
	implements SQLWrapper
{
	static override readonly [entityKind]: string = 'DSQLInsert';

	protected config: DSQLInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: Record<string, Param | SQL>[],
		private session: DSQLSession | undefined,
		private dialect: DSQLDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, values, withList };
	}

	returning(fields?: SelectedFieldsFlat): DSQLInsertBase<TTable, any, any> {
		const returningFields = fields ?? this.config.table[Table.Symbol.Columns];
		this.config.returning = orderSelectedFields<DSQLColumn>(returningFields);
		return this as any;
	}

	onConflictDoNothing(config: { target?: any } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const targetColumn = Array.isArray(config.target)
				? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
				: this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));

			this.config.onConflict = sql`(${sql.raw(targetColumn)}) do nothing`;
		}
		return this;
	}

	/**
	 * Adds an `ON CONFLICT DO UPDATE` clause to the INSERT query.
	 *
	 * @param config - Configuration for conflict resolution
	 * @param config.target - The column(s) that define the unique constraint
	 * @param config.set - The values to set when a conflict occurs
	 * @param config.setWhere - WHERE clause for the UPDATE action (filters which rows to update)
	 *
	 * @example
	 * ```ts
	 * // Basic upsert
	 * await db.insert(users)
	 *   .values({ id: '1', name: 'Alice' })
	 *   .onConflictDoUpdate({
	 *     target: users.id,
	 *     set: { name: 'Alice Updated' },
	 *   });
	 *
	 * // With setWhere (conditional update)
	 * await db.insert(users)
	 *   .values({ id: '1', name: 'Alice' })
	 *   .onConflictDoUpdate({
	 *     target: users.id,
	 *     set: { name: 'Alice Updated' },
	 *     setWhere: sql`excluded.updated_at > ${users.updatedAt}`,
	 *   });
	 * ```
	 */
	onConflictDoUpdate(config: {
		target: any;
		set: Record<string, unknown>;
		setWhere?: SQL;
	}): this {
		const targetColumn = Array.isArray(config.target)
			? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
			: this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));

		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : undefined;

		this.config.onConflict = sql`(${sql.raw(targetColumn)}) do update set ${setSql}${setWhereSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
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
				type: 'insert',
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

applyMixins(DSQLInsertBase, [QueryPromise]);
