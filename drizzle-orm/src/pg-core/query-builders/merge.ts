import type { AnyColumn, GetColumnData } from '~/column.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type {
	PgPreparedQuery,
	PgQueryResultHKT,
	PgQueryResultKind,
	PgSession,
	PreparedQueryConfig,
} from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, Param, type Query, SQL, type SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { mapUpdateSet, type NeonAuthToken, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { PgColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { PgUpdateSetSource } from './update.ts';

export type PgMergeInsertValue<TTable extends PgTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key]>
			| SQL
			| PgColumn
			| undefined;
	}
	& {};

export type PgMergeWhenMatchedClause =
	& {
		type: 'matched';
		predicate?: SQL;
	}
	& (
		| { action: 'update'; set: UpdateSet }
		| { action: 'delete' }
		| { action: 'do_nothing' }
	);

export type PgMergeWhenNotMatchedClause =
	& {
		type: 'not_matched';
		predicate?: SQL;
	}
	& (
		| { action: 'insert'; values: Record<string, SQL | Param | AnyColumn> }
		| { action: 'do_nothing' }
	);

export type PgMergeWhenClause = PgMergeWhenMatchedClause | PgMergeWhenNotMatchedClause;

export interface PgMergeConfig {
	table: PgTable;
	source: PgTable | Subquery | SQL;
	on: SQL;
	whenClauses: PgMergeWhenClause[];
	returningFields?: SelectedFieldsFlat;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type PgMergePrepare<T extends AnyPgMerge> = PgPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type AnyPgMerge = PgMergeBase<any, any, any, any, any, any>;

export type PgMerge<
	TTarget extends PgTable = PgTable,
	TSource extends PgTable | Subquery | SQL = PgTable | Subquery | SQL,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgMergeBase<TTarget, TSource, TQueryResult, TSelectedFields, TReturning, true>;

export interface PgMergeBase<
	TTarget extends PgTable,
	TSource extends PgTable | Subquery | SQL,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
> extends
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly table: TTarget;
		readonly source: TSource;
		readonly queryResult: TQueryResult;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly result: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class PgMergeBase<
	TTarget extends PgTable,
	TSource extends PgTable | Subquery | SQL,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
> extends QueryPromise<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'PgMerge';

	/** @internal */
	readonly config: PgMergeConfig;

	constructor(
		table: TTarget,
		source: TSource,
		on: SQL,
		private session: PgSession,
		private dialect: PgDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = {
			table,
			source,
			on,
			whenClauses: [],
			withList,
		};
	}

	/**
	 * Adds a `WHEN MATCHED` clause to the MERGE statement.
	 *
	 * This clause defines what to do when a row in the target table matches a row in the source.
	 * Optionally, a condition can be provided to further filter matched rows.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/merge}
	 *
	 * @param predicate An optional SQL condition to filter which matched rows this clause applies to.
	 *
	 * @example
	 * ```ts
	 * // Update matched rows
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched()
	 *   .update({ name: source.name });
	 *
	 * // Delete matched rows with a condition
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched(eq(source.status, 'inactive'))
	 *   .delete();
	 * ```
	 */
	whenMatched(predicate?: SQL): PgMergeMatchedActionBuilder<TTarget, TSource, TQueryResult, this> {
		return new PgMergeMatchedActionBuilder(this, predicate);
	}

	/**
	 * Adds a `WHEN NOT MATCHED` clause to the MERGE statement.
	 *
	 * This clause defines what to do when a row in the source table has no matching row in the target.
	 * Optionally, a condition can be provided to further filter unmatched rows.
	 *
	 * Requires PostgreSQL 15+.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/merge}
	 *
	 * @param predicate An optional SQL condition to filter which unmatched rows this clause applies to.
	 *
	 * @example
	 * ```ts
	 * // Insert unmatched rows
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenNotMatched()
	 *   .insert({ id: source.id, name: source.name });
	 *
	 * // Do nothing for unmatched rows with a condition
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenNotMatched(eq(source.status, 'inactive'))
	 *   .doNothing();
	 * ```
	 */
	whenNotMatched(predicate?: SQL): PgMergeNotMatchedActionBuilder<TTarget, TSource, TQueryResult, this> {
		return new PgMergeNotMatchedActionBuilder(this, predicate);
	}

	/**
	 * Adds a `RETURNING` clause to the MERGE statement.
	 *
	 * Calling this method will return the specified fields of the affected rows.
	 * If no fields are specified, all target table fields will be returned.
	 *
	 * **Requires PostgreSQL 17+.**
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/merge}
	 *
	 * @example
	 * ```ts
	 * // Merge and return all affected rows
	 * const result = await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched().update({ name: source.name })
	 *   .whenNotMatched().insert({ id: source.id, name: source.name })
	 *   .returning();
	 *
	 * // Merge and return specific fields
	 * const result = await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched().update({ name: source.name })
	 *   .returning({ id: target.id, name: target.name });
	 * ```
	 */
	returning(): PgMergeBase<
		TTarget,
		TSource,
		TQueryResult,
		TTarget['_']['columns'],
		TTarget['$inferSelect']
	>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgMergeBase<
		TTarget,
		TSource,
		TQueryResult,
		TSelectedFields,
		SelectResultFields<TSelectedFields>
	>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): PgMergeBase<TTarget, TSource, TQueryResult, any, any> {
		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<PgColumn>(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildMergeQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): PgMergePrepare<this> {
		return this.session.prepareQuery<
			PreparedQueryConfig & {
				execute: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
			}
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'insert',
			tables: extractUsedTable(this.config.table),
		});
	}

	prepare(name: string): PgMergePrepare<this> {
		return this._prepare(name);
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues, this.authToken);
	};

	/** @internal */
	getSelectedFields(): this['_']['selectedFields'] {
		return (
			this.config.returningFields
				? new Proxy(
					this.config.returningFields,
					new SelectionProxyHandler({
						alias: getTableName(this.config.table),
						sqlAliasedBehavior: 'alias',
						sqlBehavior: 'error',
					}),
				)
				: undefined
		) as this['_']['selectedFields'];
	}

	$dynamic(): PgMerge<TTarget, TSource, TQueryResult, TSelectedFields, TReturning> {
		return this as any;
	}
}

export class PgMergeMatchedActionBuilder<
	TTarget extends PgTable,
	TSource extends PgTable | Subquery | SQL,
	TQueryResult extends PgQueryResultHKT,
	TParent extends PgMergeBase<TTarget, TSource, TQueryResult, any, any, any>,
> {
	static readonly [entityKind]: string = 'PgMergeMatchedActionBuilder';

	constructor(
		private parent: TParent,
		private predicate?: SQL,
	) {}

	/**
	 * Updates the matched row with the provided values.
	 *
	 * @example
	 * ```ts
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched()
	 *   .update({ name: source.name, updatedAt: sql`now()` });
	 * ```
	 */
	update(values: PgUpdateSetSource<TTarget>): TParent {
		this.parent.config.whenClauses.push({
			type: 'matched',
			predicate: this.predicate,
			action: 'update',
			set: mapUpdateSet(this.parent.config.table, values),
		});
		return this.parent;
	}

	/**
	 * Deletes the matched row from the target table.
	 *
	 * @example
	 * ```ts
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched(eq(source.status, 'deleted'))
	 *   .delete();
	 * ```
	 */
	delete(): TParent {
		this.parent.config.whenClauses.push({
			type: 'matched',
			predicate: this.predicate,
			action: 'delete',
		});
		return this.parent;
	}

	/**
	 * Does nothing for the matched row.
	 *
	 * @example
	 * ```ts
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenMatched(gt(target.version, source.version))
	 *   .doNothing();
	 * ```
	 */
	doNothing(): TParent {
		this.parent.config.whenClauses.push({
			type: 'matched',
			predicate: this.predicate,
			action: 'do_nothing',
		});
		return this.parent;
	}
}

export class PgMergeNotMatchedActionBuilder<
	TTarget extends PgTable,
	TSource extends PgTable | Subquery | SQL,
	TQueryResult extends PgQueryResultHKT,
	TParent extends PgMergeBase<TTarget, TSource, TQueryResult, any, any, any>,
> {
	static readonly [entityKind]: string = 'PgMergeNotMatchedActionBuilder';

	constructor(
		private parent: TParent,
		private predicate?: SQL,
	) {}

	/**
	 * Inserts the unmatched source row into the target table.
	 *
	 * Values can reference source table columns directly (as `PgColumn`) or use SQL expressions.
	 *
	 * @example
	 * ```ts
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenNotMatched()
	 *   .insert({ id: source.id, name: source.name });
	 * ```
	 */
	insert(values: PgMergeInsertValue<TTarget>): TParent {
		const tableColumns = this.parent.config.table[Table.Symbol.Columns];
		const mapped: Record<string, SQL | Param | AnyColumn> = {};
		for (const key of Object.keys(values)) {
			const colValue = values[key as keyof typeof values];
			if (colValue === undefined) continue;
			mapped[key] = is(colValue, SQL) || is(colValue, Column) ? colValue : new Param(colValue, tableColumns[key]);
		}
		this.parent.config.whenClauses.push({
			type: 'not_matched',
			predicate: this.predicate,
			action: 'insert',
			values: mapped,
		});
		return this.parent;
	}

	/**
	 * Does nothing for the unmatched source row.
	 *
	 * @example
	 * ```ts
	 * await db.merge(target)
	 *   .using(source, eq(target.id, source.id))
	 *   .whenNotMatched(lt(source.priority, 5))
	 *   .doNothing();
	 * ```
	 */
	doNothing(): TParent {
		this.parent.config.whenClauses.push({
			type: 'not_matched',
			predicate: this.predicate,
			action: 'do_nothing',
		});
		return this.parent;
	}
}

export class PgMergeBuilder<TTarget extends PgTable, TQueryResult extends PgQueryResultHKT> {
	static readonly [entityKind]: string = 'PgMergeBuilder';

	declare readonly _: {
		readonly table: TTarget;
	};

	constructor(
		private table: TTarget,
		private session: PgSession,
		private dialect: PgDialect,
		private withList?: Subquery[],
	) {}

	private authToken?: NeonAuthToken;
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	/**
	 * Specifies the source table or subquery and the join condition for the MERGE statement.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/merge}
	 *
	 * @param source The source table, subquery, or SQL expression to merge from.
	 * @param on The SQL condition that joins the target and source.
	 *
	 * @example
	 * ```ts
	 * // Using a table as source
	 * db.merge(target).using(source, eq(target.id, source.id))
	 *
	 * // Using a subquery as source
	 * db.merge(target).using(
	 *   db.select().from(source).where(eq(source.active, true)).as('active_source'),
	 *   eq(target.id, sql`active_source.id`)
	 * )
	 * ```
	 */
	using<TSource extends PgTable | Subquery | SQL>(
		source: TSource,
		on: SQL,
	): PgMergeBase<TTarget, TSource, TQueryResult> {
		return new PgMergeBase<TTarget, TSource, TQueryResult>(
			this.table,
			source,
			on,
			this.session,
			this.dialect,
			this.withList,
		).setToken(this.authToken);
	}
}
