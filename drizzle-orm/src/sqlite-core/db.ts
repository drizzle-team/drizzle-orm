import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import {
	QueryBuilder,
	SQLiteDeleteBase,
	SQLiteInsertBuilder,
	SQLiteSelectBase,
	SQLiteSelectBuilder,
	SQLiteSelectQueryBuilderBase,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders/index.ts';
import type {
	DBResult,
	Result,
	SQLiteSession,
	SQLiteTransaction,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { RelationalQueryBuilder } from './query-builders/query.ts';
import { SQLiteRaw } from './query-builders/raw.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type { WithSubqueryWithSelection } from './subquery.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';

export class BaseSQLiteDatabase<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'BaseSQLiteDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly tableNamesMap: Record<string, string>;
	};

	query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: RelationalQueryBuilder<TResultKind, TFullSchema, TSchema, TSchema[K]>;
		};

	constructor(
		private resultKind: TResultKind,
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
		/** @internal */
		readonly session: SQLiteSession<TResultKind, TRunResult, TFullSchema, TSchema>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? { schema: schema.schema, tableNamesMap: schema.tableNamesMap }
			: { schema: undefined, tableNamesMap: {} };
		this.query = {} as typeof this['query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				this.query[tableName as keyof TSchema] = new RelationalQueryBuilder(
					resultKind,
					schema!.fullSchema,
					this._.schema,
					this._.tableNamesMap,
					schema!.fullSchema[tableName] as SQLiteTable,
					columns,
					dialect,
					session as SQLiteSession<any, any, any, any> as any,
				) as this['query'][keyof TSchema];
			}
		}
	}

	$with<TAlias extends string>(alias: TAlias) {
		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(new QueryBuilder());
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelectedFields() as SelectedFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	$withRecursive<TAlias extends string>(alias: TAlias) {
		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(new QueryBuilder());
				}

				if (is(qb, SQLiteSelectQueryBuilderBase)) {
					qb.setSelfReferenceName(alias);
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelectedFields() as SelectedFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteSelectBuilder<TResultKind, void>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<TResultKind, void>
			| SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectBase({
					table: undefined,
					fields,
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					isPartialSelect: true,
				})
				: new SQLiteSelectBuilder({
					session: self.session,
					dialect: self.dialect,
					withList: queries,
				});
		}

		function selectDistinct(): SQLiteSelectBuilder<TResultKind, void>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<TResultKind, void>
			| SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectBase({
					table: undefined,
					fields,
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					isPartialSelect: true,
					distinct: true,
				})
				: new SQLiteSelectBuilder({
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					distinct: true,
				});
		}

		return { select, selectDistinct };
	}

	withRecursive(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteSelectBuilder<TResultKind, void>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<TResultKind, void>
			| SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectBase({
					table: undefined,
					fields,
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					isPartialSelect: true,
					recursive: true,
				})
				: new SQLiteSelectBuilder({
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					recursive: true,
				});
		}

		function selectDistinct(): SQLiteSelectBuilder<TResultKind, void>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<TResultKind, void>
			| SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectBase({
					table: undefined,
					fields,
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					isPartialSelect: true,
					distinct: true,
					recursive: true,
				})
				: new SQLiteSelectBuilder({
					session: self.session,
					dialect: self.dialect,
					withList: queries,
					distinct: true,
					recursive: true,
				});
		}

		return { select, selectDistinct };
	}

	select(): SQLiteSelectBuilder<TResultKind, void>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	):
		| SQLiteSelectBuilder<TResultKind, void>
		| SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>
	{
		return fields
			? new SQLiteSelectBase({
				table: undefined,
				fields,
				session: this.session,
				dialect: this.dialect,
				isPartialSelect: true,
			})
			: new SQLiteSelectBuilder({
				session: this.session,
				dialect: this.dialect,
			});
	}

	selectDistinct(): SQLiteSelectBuilder<TResultKind, void>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	):
		| SQLiteSelectBuilder<TResultKind, void>
		| SQLiteSelectBase<undefined, TResultKind, void, TSelection, 'partial'>
	{
		return fields
			? new SQLiteSelectBase({
				table: undefined,
				fields,
				session: this.session,
				dialect: this.dialect,
				isPartialSelect: true,
				distinct: true,
			})
			: new SQLiteSelectBuilder({
				session: this.session,
				dialect: this.dialect,
				distinct: true,
			});
	}

	update<TTable extends SQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TResultKind, TRunResult> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends SQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, TResultKind, TRunResult> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect);
	}

	delete<TTable extends SQLiteTable>(from: TTable): SQLiteDeleteBase<TTable, TResultKind, TRunResult> {
		return new SQLiteDeleteBase(from, this.session, this.dialect);
	}

	run(query: SQLWrapper): DBResult<TResultKind, TRunResult> {
		const sql = query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.run(sql),
				() => sql,
				'run',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawRunValueFromBatchResult.bind(this.session),
			) as DBResult<TResultKind, TRunResult>;
		}
		return this.session.run(sql) as DBResult<TResultKind, TRunResult>;
	}

	all<T = unknown>(query: SQLWrapper): DBResult<TResultKind, T[]> {
		const sql = query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.all(sql),
				() => sql,
				'all',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawAllValueFromBatchResult.bind(this.session),
			) as any;
		}
		return this.session.all(sql) as DBResult<TResultKind, T[]>;
	}

	get<T = unknown>(query: SQLWrapper): DBResult<TResultKind, T> {
		const sql = query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.get(sql),
				() => sql,
				'get',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawGetValueFromBatchResult.bind(this.session),
			) as DBResult<TResultKind, T>;
		}
		return this.session.get(sql) as DBResult<TResultKind, T>;
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper): DBResult<TResultKind, T[]> {
		const sql = query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.values(sql),
				() => sql,
				'values',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawValuesValueFromBatchResult.bind(this.session),
			) as any;
		}
		return this.session.values(sql) as DBResult<TResultKind, T[]>;
	}

	transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TSchema>) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T> {
		return this.session.transaction(transaction, config);
	}
}

export type SQLiteWithReplicas<Q> = Q & { $primary: Q };

export const withReplicas = <
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
	Q extends BaseSQLiteDatabase<
		TResultKind,
		TRunResult,
		TFullSchema,
		TSchema extends Record<string, unknown> ? ExtractTablesWithRelations<TFullSchema> : TSchema
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SQLiteWithReplicas<Q> => {
	const select: Q['select'] = (...args: any) => getReplica(replicas).select(args) as any;
	const selectDistinct: Q['selectDistinct'] = (...args: any) => getReplica(replicas).selectDistinct(args) as any;
	const $with: Q['with'] = (...args: any) => getReplica(replicas).with(args);

	const update: Q['update'] = (...args: any) => primary.update(args);
	const insert: Q['insert'] = (...args: any) => primary.insert(args);
	const $delete: Q['delete'] = (...args: any) => primary.delete(args);
	const run: Q['run'] = (...args: any) => primary.run(args);
	const all: Q['all'] = (...args: any) => primary.all(args);
	const get: Q['get'] = (...args: any) => primary.get(args);
	const values: Q['values'] = (...args: any) => primary.values(args);
	const transaction: Q['transaction'] = (...args: any) => primary.transaction(args);

	return new Proxy<Q & { $primary: Q }>(
		{
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
			select,
			selectDistinct,
			with: $with,
		},
		{
			get(target, prop, _receiver) {
				if (prop === 'query') {
					return getReplica(replicas).query;
				}
				return target[prop as keyof typeof target];
			},
		},
	);
};
