import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { MutationOption } from '~/cache/core/cache.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { QueryBuilder } from '~/sqlite-core/query-builders/query-builder.ts';
import type { SelectedFields } from '~/sqlite-core/query-builders/select.types.ts';
import type { SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { SQLiteViewBase } from '~/sqlite-core/view-base.ts';
import { WithSubquery } from '~/subquery.ts';
import type { WithBuilder } from '../subquery.ts';
import { SQLiteEffectCountBuilder } from './count.ts';
import { SQLiteEffectDeleteBase } from './delete.ts';
import { SQLiteEffectInsertBuilder } from './insert.ts';
import { SQLiteEffectRelationalQueryBuilder } from './query.ts';
import { SQLiteEffectRaw } from './raw.ts';
import { SQLiteEffectSelectBuilder } from './select.ts';
import type { SQLiteEffectSelectBase } from './select.ts';
import type { SQLiteEffectSession, SQLiteEffectTransaction } from './session.ts';
import { SQLiteEffectUpdateBuilder } from './update.ts';

export class SQLiteEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'SQLiteEffectDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: SQLiteEffectSession<TEffectHKT, TRunResult, TRelations>;
	};

	query: {
		[K in keyof TRelations]: SQLiteEffectRelationalQueryBuilder<
			TRelations,
			TRelations[K],
			TEffectHKT
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: SQLiteAsyncDialect,
		/** @internal */
		readonly session: SQLiteEffectSession<TEffectHKT, TRunResult, TRelations>,
		relations: TRelations,
		readonly rowModeRQB?: boolean,
		readonly forbidJsonb?: boolean,
	) {
		this._ = {
			relations,
			session,
		};

		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as SQLiteEffectDatabase<
				TEffectHKT,
				TRunResult,
				AnyRelations
			>['query'])[tableName] = new SQLiteEffectRelationalQueryBuilder(
				relations,
				relations[relation.name]!.table as SQLiteTable,
				relation,
				dialect,
				session,
				rowModeRQB,
				forbidJsonb,
			);
		}

		this.$cache = {
			invalidate: (_params: MutationOption) => Effect.void,
		};
	}

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

	$cache: { invalidate: EffectCacheShape['onMutate'] };

	$count(
		source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new SQLiteEffectCountBuilder({ source, filters, session: this.session });
	}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
		function select(
			fields?: SelectedFields,
		): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
			return new SQLiteEffectSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		function selectDistinct(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
			return new SQLiteEffectSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		function update<TTable extends SQLiteTable>(
			table: TTable,
		): SQLiteEffectUpdateBuilder<TTable, TRunResult, TEffectHKT> {
			return new SQLiteEffectUpdateBuilder(table, self.session, self.dialect, queries);
		}

		function insert<TTable extends SQLiteTable>(
			into: TTable,
		): SQLiteEffectInsertBuilder<TTable, TRunResult, TEffectHKT> {
			return new SQLiteEffectInsertBuilder(into, self.session, self.dialect, queries);
		}

		function delete_<TTable extends SQLiteTable>(
			from: TTable,
		): SQLiteEffectDeleteBase<TTable, TRunResult, undefined, false, never, TEffectHKT> {
			return new SQLiteEffectDeleteBase(from, self.session, self.dialect, queries);
		}

		return { select, selectDistinct, update, insert, delete: delete_ };
	}

	select(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
	select(fields?: SelectedFields): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
		return new SQLiteEffectSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
	}

	selectDistinct(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
	selectDistinct(
		fields?: SelectedFields,
	): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
		return new SQLiteEffectSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	update<TTable extends SQLiteTable>(table: TTable): SQLiteEffectUpdateBuilder<TTable, TRunResult, TEffectHKT> {
		return new SQLiteEffectUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends SQLiteTable>(into: TTable): SQLiteEffectInsertBuilder<TTable, TRunResult, TEffectHKT> {
		return new SQLiteEffectInsertBuilder(into, this.session, this.dialect);
	}

	delete<TTable extends SQLiteTable>(
		from: TTable,
	): SQLiteEffectDeleteBase<TTable, TRunResult, undefined, false, never, TEffectHKT> {
		return new SQLiteEffectDeleteBase(from, this.session, this.dialect);
	}

	private raw<TResult>(
		query: SQLWrapper | string,
		action: 'all' | 'get' | 'run' | 'values',
		execute: (query: SQL) => Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>,
	): SQLiteEffectRaw<TResult, TEffectHKT> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		return new SQLiteEffectRaw(
			() => execute(sequel),
			() => sequel,
			action,
			this.dialect,
			(result) => result,
		);
	}

	run(query: SQLWrapper | string): SQLiteEffectRaw<TRunResult, TEffectHKT> {
		return this.raw(query, 'run', (sequel) => this.session.run(sequel));
	}

	all<T = unknown>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT> {
		return this.raw(query, 'all', (sequel) => this.session.all(sequel));
	}

	get<T = unknown>(query: SQLWrapper | string): SQLiteEffectRaw<T | undefined, TEffectHKT> {
		return this.raw(query, 'get', (sequel) => this.session.get(sequel));
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT> {
		return this.raw(query, 'values', (sequel) => this.session.values(sequel));
	}

	transaction: <A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: SQLiteTransactionConfig,
	) => Effect.Effect<A, E | SqlError, R> = (tx, config) => this.session.transaction(tx, config);
}

export type SQLiteEffectWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations,
	Q extends SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SQLiteEffectWithReplicas<Q> => {
	const select: Q['select'] = (...args: []) => getReplica(replicas).select(...args);
	const selectDistinct: Q['selectDistinct'] = (...args: []) => getReplica(replicas).selectDistinct(...args);
	const $count: Q['$count'] = (...args: [any]) => getReplica(replicas).$count(...args);
	const _with: Q['with'] = (...args: []) => getReplica(replicas).with(...args);
	const $with: Q['$with'] = (arg: any) => getReplica(replicas).$with(arg) as any;

	const update: Q['update'] = (...args: [any]) => primary.update(...args);
	const insert: Q['insert'] = (...args: [any]) => primary.insert(...args);
	const $delete: Q['delete'] = (...args: [any]) => primary.delete(...args);
	const run: Q['run'] = (...args: [any]) => primary.run(...args);
	const all: Q['all'] = (...args: [any]) => primary.all(...args);
	const get: Q['get'] = (...args: [any]) => primary.get(...args);
	const values: Q['values'] = (...args: [any]) => primary.values(...args);
	const transaction: Q['transaction'] = (...args: [any]) => primary.transaction(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		run,
		all,
		get,
		values,
		transaction,
		$primary: primary,
		$replicas: replicas,
		select,
		selectDistinct,
		$count,
		$with,
		with: _with,
		get query() {
			return getReplica(replicas).query;
		},
	};
};

export type AnySQLiteEffectDatabase = SQLiteEffectDatabase<any, any, any>;
export type AnySQLiteEffectSelectBase = SQLiteEffectSelectBase<any, any, any, any, any, any, any, any, any, any>;
