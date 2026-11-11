import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { ClickHouseDialect } from './dialect.ts';
import { ClickHouseCountBuilder } from './query-builders/count.ts';
import {
	ClickHouseDeleteBase,
	ClickHouseInsertBuilder,
	ClickHouseSelectBuilder,
	ClickHouseUpdateBuilder,
	QueryBuilder,
} from './query-builders/index.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type {
	ClickHouseQueryResultHKT,
	ClickHouseQueryResultKind,
	ClickHouseSession,
	PreparedQueryHKTBase,
} from './session.ts';
import type { WithBuilder } from './subquery.ts';
import type { ClickHouseTable } from './table.ts';

/**
 * A ClickHouse database handle.
 *
 * Two things are deliberately absent compared with the row-store dialects:
 *
 * - `transaction()` — ClickHouse's transactions are experimental and single-node, so Drizzle does not
 *   expose an API that would imply atomicity it cannot provide.
 * - `db.query` — the relational query API is built on foreign keys and correlated lateral joins,
 *   neither of which ClickHouse has. Model relations with explicit joins instead.
 */
export class ClickHouseDatabase<
	TQueryResult extends ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = {},
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'ClickHouseDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
	};

	constructor(
		/** @internal */
		readonly dialect: ClickHouseDialect,
		/** @internal */
		readonly session: ClickHouseSession<any, any>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? {
				schema: schema.schema,
				fullSchema: schema.fullSchema as TFullSchema,
				tableNamesMap: schema.tableNamesMap,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
			};
		this.$cache = { invalidate: async (_params: any) => {} };
	}

	/**
	 * Creates a subquery that defines a temporary named result set as a CTE.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param alias The alias for the subquery.
	 */
	$with: WithBuilder = (alias: string, selection?: ColumnsSelection) => {
		const self = this;
		const as = (
			qb:
				| TypedQueryBuilder<ColumnsSelection | undefined>
				| SQL
				| ((qb: QueryBuilder) => TypedQueryBuilder<ColumnsSelection | undefined> | SQL),
		) => {
			if (typeof qb === 'function') {
				qb = qb(new QueryBuilder(self.dialect));
			}

			return new Proxy(
				new WithSubquery(
					qb.getSQL(),
					selection ?? ('getSelectedFields' in qb ? qb.getSelectedFields() ?? {} : {}) as SelectedFields,
					alias,
					true,
				),
				new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
			);
		};
		return { as };
	};

	$count(source: ClickHouseTable | SQL | SQLWrapper, filters?: SQL<unknown>) {
		return new ClickHouseCountBuilder({ source, filters, session: this.session });
	}

	/**
	 * Incorporates a previously defined CTE (using `$with`) into the main query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 */
	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): ClickHouseSelectBuilder<undefined, TPreparedQueryHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): ClickHouseSelectBuilder<TSelection, TPreparedQueryHKT>;
		function select(
			fields?: SelectedFields,
		): ClickHouseSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new ClickHouseSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		function selectDistinct(): ClickHouseSelectBuilder<undefined, TPreparedQueryHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): ClickHouseSelectBuilder<TSelection, TPreparedQueryHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): ClickHouseSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new ClickHouseSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	/**
	 * Creates a select query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select}
	 *
	 * @example
	 * ```ts
	 * const allEvents = await db.select().from(events);
	 *
	 * const urls = await db.select({ url: events.url }).from(events);
	 * ```
	 */
	select(): ClickHouseSelectBuilder<undefined, TPreparedQueryHKT>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): ClickHouseSelectBuilder<TSelection, TPreparedQueryHKT>;
	select(fields?: SelectedFields): ClickHouseSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new ClickHouseSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
	}

	/**
	 * Adds `distinct` to a select query, returning only unique rows.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
	 */
	selectDistinct(): ClickHouseSelectBuilder<undefined, TPreparedQueryHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): ClickHouseSelectBuilder<TSelection, TPreparedQueryHKT>;
	selectDistinct(fields?: SelectedFields): ClickHouseSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new ClickHouseSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	/**
	 * Creates an `ALTER TABLE … UPDATE` mutation.
	 *
	 * ClickHouse has no in-place `UPDATE`. The statement returns as soon as the mutation is accepted
	 * and the rewrite happens asynchronously — pass `.settings({ mutations_sync: 2 })` to wait for it.
	 * Updates are expensive; prefer modelling changes as new rows with a `ReplacingMergeTree`.
	 *
	 * @example
	 * ```ts
	 * await db.update(users).set({ name: 'Ada' }).where(eq(users.id, 1));
	 * ```
	 */
	update<TTable extends ClickHouseTable>(
		table: TTable,
	): ClickHouseUpdateBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new ClickHouseUpdateBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates an insert query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/insert}
	 *
	 * @example
	 * ```ts
	 * await db.insert(events).values({ id: 1n, url: '/' });
	 * await db.insert(events).values([{ id: 1n, url: '/' }, { id: 2n, url: '/about' }]);
	 * ```
	 */
	insert<TTable extends ClickHouseTable>(
		table: TTable,
	): ClickHouseInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new ClickHouseInsertBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates a delete query.
	 *
	 * Emits a lightweight `DELETE FROM … WHERE`; call `.mutation()` for `ALTER TABLE … DELETE`.
	 * Calling this without `.where()` deletes every row.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 */
	delete<TTable extends ClickHouseTable>(
		table: TTable,
	): ClickHouseDeleteBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new ClickHouseDeleteBase(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = Record<string, unknown>>(
		query: SQLWrapper | string,
	): Promise<ClickHouseQueryResultKind<TQueryResult, T>> {
		return this.session.execute(typeof query === 'string' ? sql.raw(query) : query.getSQL());
	}

	$cache: { invalidate: Cache['onMutate'] };
}

export type ClickHouseWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	Q extends ClickHouseDatabase<any, any, any, any>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): ClickHouseWithReplicas<Q> => {
	const select: Q['select'] = (...args: []) => getReplica(replicas).select(...args);
	const selectDistinct: Q['selectDistinct'] = (...args: []) => getReplica(replicas).selectDistinct(...args);
	const $count: Q['$count'] = (...args: [any]) => getReplica(replicas).$count(...args);
	const $with: Q['with'] = (...args: []) => getReplica(replicas).with(...args);

	const update: Q['update'] = (...args: [any]) => primary.update(...args);
	const insert: Q['insert'] = (...args: [any]) => primary.insert(...args);
	const $delete: Q['delete'] = (...args: [any]) => primary.delete(...args);
	const execute: Q['execute'] = (...args: [any]) => primary.execute(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		execute,
		$primary: primary,
		$replicas: replicas,
		select,
		selectDistinct,
		$count,
		with: $with,
	};
};
