import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError, IsNever, JoinUnion } from '~/utils.ts';
import type { MySqlDialect } from './dialect.ts';
import { MySqlInsertBuilder, type NoDuplicateColumns } from './query-builders/insert.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { type MySqlRelationalQueryConstructor, RelationalQueryBuilder } from './query-builders/query.ts';
import { MySqlSelectBuilder } from './query-builders/select.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { MySqlUpdateBuilder } from './query-builders/update.ts';
import type { MySqlQueryResultHKT, MySqlSession } from './session.ts';
import type { WithBuilder } from './subquery.ts';
import type { MySqlTable } from './table.ts';
import type { MySqlViewBase } from './view-base.ts';
import type { MySqlView } from './view.ts';

type AnyConstructor = new(...args: any[]) => any;

/**
 * @internal
 * The builder classes of a runtime, which a {@link MySqlDatabase}'s methods construct: `MySqlAsync*` classes resolve
 * as Promises, `MySqlEffect*` ones run as Effects
 */
export interface MySqlDatabaseBuilders {
	readonly select: AnyConstructor;
	readonly insert: AnyConstructor;
	readonly update: AnyConstructor;
	readonly delete: AnyConstructor;
	readonly count: AnyConstructor;
	readonly raw: AnyConstructor;
	readonly relationalQuery: MySqlRelationalQueryConstructor;
}

/** The column list of `insert(table, ...columns)`: it must name every required column */
export type MySqlInsertColumns<
	TColumnList extends unknown[],
	TRequiredKeys extends string,
> = TColumnList extends [] ? []
	: IsNever<TRequiredKeys> extends true ? TColumnList & NoDuplicateColumns<TColumnList>
	: [TRequiredKeys] extends [TColumnList[number]] ? TColumnList & NoDuplicateColumns<TColumnList>
	: DrizzleTypeError<
		`Column selection is missing following required columns: ${JoinUnion<
			`"${Exclude<TRequiredKeys, TColumnList[number]>}"`,
			', '
		>}`
	>[];

/**
 * A database of either runtime. it's methods are written once, over the runtime's {@link MySqlDatabaseBuilders}: each
 * runtime's database narrows their types to it's own builders (`MySqlAsyncDatabase`, `MySqlEffectDatabase`)
 */
export abstract class MySqlDatabase<
	// oxlint-disable-next-line no-unused-vars
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'MySqlBaseDatabase';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: MySqlSession;
	};

	query: unknown;

	constructor(
		/** @internal The runtime's builders */
		protected readonly builders: MySqlDatabaseBuilders,
		/** @internal */
		readonly dialect: MySqlDialect,
		/** @internal */
		readonly session: MySqlSession,
		relations: TRelations,
	) {
		this._ = {
			relations,
			session,
		};

		const query: Record<string, unknown> = {};
		const relationalQuery = builders.relationalQuery;
		for (const [tableName, relation] of Object.entries(relations)) {
			query[tableName] = new RelationalQueryBuilder(
				relations,
				relations[relation.name]!.table as MySqlTable | MySqlView,
				relation,
				dialect,
				session,
				relationalQuery,
			);
		}
		this.query = query;
	}

	/**
	 * Creates a subquery that defines a temporary named result set as a CTE.
	 *
	 * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param alias The alias for the subquery.
	 *
	 * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
	 *
	 * @example
	 *
	 * ```ts
	 * // Create a subquery with alias 'sq' and use it in the select query
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 *
	 * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
	 *
	 * ```ts
	 * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
	 * const sq = db.$with('sq').as(db.select({
	 *   name: sql<string>`upper(${users.name})`.as('name'),
	 * })
	 * .from(users));
	 *
	 * const result = await db.with(sq).select({ name: sq.name }).from(sq);
	 * ```
	 */
	$with: WithBuilder = (alias: string, selection?: ColumnsSelection) => {
		const as = (
			qb:
				| TypedQueryBuilder<ColumnsSelection | undefined>
				| SQL
				| ((qb: QueryBuilder) => TypedQueryBuilder<ColumnsSelection | undefined> | SQL),
		) => {
			if (typeof qb === 'function') {
				qb = qb(new QueryBuilder(this.dialect));
			}

			const sql = qb.getSQL();
			return new Proxy(
				new WithSubquery(
					sql,
					selection ?? ('getSelectedFields' in qb ? qb.getSelectedFields() ?? {} : {}) as SelectedFields,
					alias,
					true,
				),
				new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
			);
		};
		return { as };
	};

	$count(source: MySqlTable | MySqlViewBase | SQL | SQLWrapper, filters?: SQL<unknown>): unknown {
		return new this.builders.count({ source, filters, session: this.session, dialect: this.dialect });
	}

	with(...queries: WithSubquery[]): unknown {
		return {
			select: (fields?: SelectedFields) => this.buildSelect(fields, false, queries),
			selectDistinct: (fields?: SelectedFields) => this.buildSelect(fields, true, queries),
			update: (table: MySqlTable) => this.buildUpdate(table, queries),
			delete: (table: MySqlTable) => this.buildDelete(table, queries),
		};
	}

	select(fields?: SelectedFields): unknown {
		return this.buildSelect(fields, false, undefined);
	}

	selectDistinct(fields?: SelectedFields): unknown {
		return this.buildSelect(fields, true, undefined);
	}

	update(table: MySqlTable): unknown {
		return this.buildUpdate(table, undefined);
	}

	insert(table: MySqlTable, ...columns: string[]): unknown {
		return new MySqlInsertBuilder(
			table,
			this.session,
			this.dialect,
			columns.length ? columns : undefined,
			this.builders.insert,
		);
	}

	delete(table: MySqlTable): unknown {
		return this.buildDelete(table, undefined);
	}

	execute(query: SQLWrapper | string, mode?: 'raw' | 'objects' | 'arrays' | undefined): unknown {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, mode ?? 'raw');
		return new this.builders.raw(prepared, sequel, builtQuery);
	}

	private buildSelect(fields: SelectedFields | undefined, distinct: boolean, withList: WithSubquery[] | undefined) {
		return new MySqlSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			withList,
			distinct,
		}, this.builders.select);
	}

	private buildUpdate(table: MySqlTable, withList: WithSubquery[] | undefined) {
		return new MySqlUpdateBuilder(table, this.session, this.dialect, withList, this.builders.update);
	}

	private buildDelete(table: MySqlTable, withList: WithSubquery[] | undefined) {
		return new this.builders.delete(table, this.session, this.dialect, withList);
	}
}
