import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError, IsNever, JoinUnion } from '~/utils.ts';
import type { PgColumn } from './columns/common.ts';
import type { PgDialect } from './dialect.ts';
import type { PgProcedure } from './procedure.ts';
import { type NoDuplicateColumns, PgInsertBuilder } from './query-builders/insert.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { type PgRelationalQueryConstructor, RelationalQueryBuilder } from './query-builders/query.ts';
import { PgSelectBuilder } from './query-builders/select.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { PgUpdateBuilder } from './query-builders/update.ts';
import type { PgQueryResultHKT, PgSession } from './session.ts';
import type { WithBuilder } from './subquery.ts';
import type { PgTable } from './table.ts';
import type { PgViewBase } from './view-base.ts';
import type { PgMaterializedView } from './view.ts';

/** The column list of `insert(table, ...columns)`: it must name every required column */
export type PgInsertColumns<
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

type AnyConstructor = new(...args: any[]) => any;

/**
 * @internal
 * The builder classes of a runtime, which a {@link PgDatabase}'s methods construct: `PgAsync*` classes resolve as
 * Promises, `PgEffect*` ones run as Effects
 */
export interface PgDatabaseBuilders {
	readonly select: AnyConstructor;
	readonly insert: AnyConstructor;
	readonly update: AnyConstructor;
	readonly delete: AnyConstructor;
	readonly count: AnyConstructor;
	readonly raw: AnyConstructor;
	readonly refreshMaterializedView: AnyConstructor;
	readonly relationalQuery: PgRelationalQueryConstructor;
}

/**
 * A database of either runtime. it's methods are written once, over the runtime's {@link PgDatabaseBuilders}: each
 * runtime's database narrows their types to it's own builders (`PgAsyncDatabase`, `PgEffectDatabase`)
 */
export abstract class PgDatabase<
	// oxlint-disable-next-line no-unused-vars
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'PgDatabase';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: PgSession;
	};

	query: unknown;

	constructor(
		/** @internal The runtime's builders */
		protected readonly builders: PgDatabaseBuilders,
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: PgSession,
		relations: TRelations,
		parseRqbJson: boolean = false,
		readonly tagged: boolean = false,
	) {
		this._ = {
			relations: relations,
			session,
		};

		const query: Record<string, unknown> = {};
		const relationalQuery = builders.relationalQuery;
		for (const [tableName, relation] of Object.entries(relations)) {
			query[tableName] = new RelationalQueryBuilder(
				relations,
				relations[relation.name]!.table as PgTable,
				relation,
				dialect,
				session,
				parseRqbJson,
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

	$count(source: PgTable | PgViewBase | SQL | SQLWrapper, filters?: SQL<unknown>): unknown {
		return new this.builders.count({ source, filters, session: this.session, dialect: this.dialect });
	}

	with(...queries: WithSubquery[]): unknown {
		return {
			select: (fields?: SelectedFields) => this.buildSelect(fields, undefined, queries),
			selectDistinct: (fields?: SelectedFields) => this.buildSelect(fields, true, queries),
			selectDistinctOn: (on: (PgColumn | SQLWrapper)[], fields?: SelectedFields) =>
				this.buildSelect(fields, { on }, queries),
			update: (table: PgTable) => this.buildUpdate(table, queries),
			insert: (table: PgTable, ...columns: string[]) => this.buildInsert(table, columns, queries),
			delete: (table: PgTable) => this.buildDelete(table, queries),
		};
	}

	select(fields?: SelectedFields): unknown {
		return this.buildSelect(fields, undefined, undefined);
	}

	selectDistinct(fields?: SelectedFields): unknown {
		return this.buildSelect(fields, true, undefined);
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[], fields?: SelectedFields): unknown {
		return this.buildSelect(fields, { on }, undefined);
	}

	update(table: PgTable): unknown {
		return this.buildUpdate(table, undefined);
	}

	insert(table: PgTable, ...columns: string[]): unknown {
		return this.buildInsert(table, columns, undefined);
	}

	delete(table: PgTable): unknown {
		return this.buildDelete(table, undefined);
	}

	refreshMaterializedView(view: PgMaterializedView): unknown {
		return new this.builders.refreshMaterializedView(view, this.session, this.dialect);
	}

	execute(query: SQLWrapper | string, mode?: 'raw' | 'objects' | 'arrays' | undefined): unknown {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, mode ?? 'raw', false, undefined);
		return new this.builders.raw(prepared, sequel, builtQuery);
	}

	call(procedure: PgProcedure<any, any>, ...args: unknown[]): unknown {
		const sequel = procedure.getCallSQL((args[0] ?? {}) as Record<string, unknown>);
		const builtQuery = this.dialect.sqlToQuery(sequel);
		// CALL yields one row of the INOUT result parameters, or none for a procedure that returns nothing. `call` mode
		// runs as `objects`, but without the typecasts drivers apply to codec-decoded (mapped) queries: no codecs run here
		const prepared = this.session.prepareQuery(builtQuery, 'call', false, (rows) => rows[0]);
		return new this.builders.raw(prepared, sequel, builtQuery);
	}

	private buildSelect(
		fields: SelectedFields | undefined,
		distinct: true | { on: (PgColumn | SQLWrapper)[] } | undefined,
		withList: WithSubquery[] | undefined,
	) {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			withList,
			distinct,
			tagged: this.tagged,
		}, this.builders.select);
	}

	private buildUpdate(table: PgTable, withList: WithSubquery[] | undefined) {
		return new PgUpdateBuilder(table, this.session, this.dialect, withList, this.builders.update);
	}

	private buildInsert(table: PgTable, columns: string[], withList: WithSubquery[] | undefined) {
		return new PgInsertBuilder(
			table,
			this.session,
			this.dialect,
			withList,
			undefined,
			columns.length ? columns : undefined,
			this.builders.insert,
		);
	}

	private buildDelete(table: PgTable, withList: WithSubquery[] | undefined) {
		return new this.builders.delete(table, this.session, this.dialect, withList);
	}
}
