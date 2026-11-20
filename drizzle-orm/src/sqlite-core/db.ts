import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type Query, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { SQLiteDialect } from './dialect.ts';
import { SQLiteInsertBuilder } from './query-builders/insert.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { RelationalQueryBuilder, type SQLiteRelationalQueryConstructor } from './query-builders/query.ts';
import { SQLiteSelectBuilder } from './query-builders/select.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { SQLiteUpdateBuilder } from './query-builders/update.ts';
import type { SQLiteExecuteMethod, SQLitePreparedQuery, SQLiteSession } from './session.ts';
import type { WithBuilder } from './subquery.ts';
import type { SQLiteTable } from './table.ts';
import type { SQLiteViewBase } from './view-base.ts';

type AnyConstructor = new(...args: any[]) => any;

/**
 * @internal
 * The builder classes of a runtime, which a {@link SQLiteDatabase}'s methods construct: `SQLiteAsync*` classes resolve
 * as Promises (`SQLiteSync*` ones also run synchronously), `SQLiteEffect*` ones run as Effects
 */
export interface SQLiteDatabaseBuilders {
	readonly select: AnyConstructor;
	readonly insert: AnyConstructor;
	readonly update: AnyConstructor;
	readonly delete: AnyConstructor;
	readonly count: AnyConstructor;
	readonly raw: AnyConstructor;
	readonly relationalQuery: SQLiteRelationalQueryConstructor;
}

/**
 * A database of every runtime. it's methods are written once, over the runtime's {@link SQLiteDatabaseBuilders}: each
 * runtime's database narrows their types to it's own builders (`SQLiteAsyncDatabase`, `SQLiteEffectDatabase`)
 */
export abstract class SQLiteDatabase<
	// oxlint-disable-next-line no-unused-vars
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'SQLiteBaseDatabase';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: SQLiteSession<any, any>;
	};

	query: unknown;

	constructor(
		/** @internal The runtime's builders */
		protected readonly builders: SQLiteDatabaseBuilders,
		/** What the relational queries run as: `'sync'`, `'async'`, or `undefined` for Effects */
		resultKind: 'sync' | 'async' | undefined,
		/** @internal */
		readonly dialect: SQLiteDialect,
		/** @internal */
		readonly session: SQLiteSession<any, any>,
		relations: TRelations,
		readonly forbidJsonb?: boolean,
	) {
		this._ = {
			relations,
			session,
		};

		const query: Record<string, unknown> = {};
		for (const [tableName, relation] of Object.entries(relations)) {
			query[tableName] = new RelationalQueryBuilder(
				resultKind,
				relations,
				relations[relation.name]!.table as SQLiteTable,
				relation,
				dialect,
				session,
				forbidJsonb,
				builders.relationalQuery,
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

	$count(source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper, filters?: SQL<unknown>): unknown {
		return new this.builders.count({ source, filters, session: this.session, dialect: this.dialect });
	}

	with(...queries: WithSubquery[]): unknown {
		return {
			select: (fields?: SelectedFields) => this.buildSelect(fields, undefined, queries),
			selectDistinct: (fields?: SelectedFields) => this.buildSelect(fields, true, queries),
			update: (table: SQLiteTable) => this.buildUpdate(table, queries),
			insert: (table: SQLiteTable, ...columns: string[]) => this.buildInsert(table, columns, queries),
			delete: (table: SQLiteTable) => this.buildDelete(table, queries),
		};
	}

	select(fields?: SelectedFields): unknown {
		return this.buildSelect(fields, undefined, undefined);
	}

	selectDistinct(fields?: SelectedFields): unknown {
		return this.buildSelect(fields, true, undefined);
	}

	update(table: SQLiteTable): unknown {
		return this.buildUpdate(table, undefined);
	}

	insert(into: SQLiteTable, ...columns: string[]): unknown {
		return this.buildInsert(into, columns, undefined);
	}

	delete(from: SQLiteTable): unknown {
		return this.buildDelete(from, undefined);
	}

	run(query: SQLWrapper | string): unknown {
		return this.rawQuery(query, 'raw', 'run');
	}

	all(query: SQLWrapper | string, mode?: 'arrays' | 'objects' | undefined): unknown {
		return this.rawQuery(query, mode ?? 'objects', 'all');
	}

	get(query: SQLWrapper | string, mode?: 'arrays' | 'objects' | undefined): unknown {
		return this.rawQuery(query, mode ?? 'objects', 'get');
	}

	values(query: SQLWrapper | string): unknown {
		return this.rawQuery(query, 'arrays', 'values');
	}

	/**
	 * @internal
	 * What a raw query (`run`, `all`, `get`, `values`) gives: the runtime's raw builder, which runs the prepared query
	 * with it's `method` when awaited or yielded. Sync drivers' databases override it to run the query right away
	 */
	protected wrapRaw(prepared: SQLitePreparedQuery, sequel: SQL, builtQuery: Query, _method: SQLiteExecuteMethod) {
		return new this.builders.raw(prepared, sequel, builtQuery);
	}

	private rawQuery(query: SQLWrapper | string, mode: 'arrays' | 'objects' | 'raw', method: SQLiteExecuteMethod) {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, mode, false, method);
		return this.wrapRaw(prepared, sequel, builtQuery, method);
	}

	private buildSelect(
		fields: SelectedFields | undefined,
		distinct: true | undefined,
		withList: WithSubquery[] | undefined,
	) {
		return new SQLiteSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			withList,
			distinct,
		}, this.builders.select);
	}

	private buildUpdate(table: SQLiteTable, withList: WithSubquery[] | undefined) {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect, withList, this.builders.update);
	}

	private buildInsert(into: SQLiteTable, columns: string[], withList: WithSubquery[] | undefined) {
		return new SQLiteInsertBuilder(
			into,
			this.session,
			this.dialect,
			withList,
			columns.length ? columns : undefined,
			this.builders.insert,
		);
	}

	private buildDelete(from: SQLiteTable, withList: WithSubquery[] | undefined) {
		return new this.builders.delete(from, this.session, this.dialect, withList);
	}
}
