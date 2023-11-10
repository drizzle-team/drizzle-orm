import type { ResultSetHeader } from 'mysql2/promise';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import type { MySqlDialect } from './dialect.ts';
import {
	MySqlDeleteBase,
	MySqlInsertBuilder,
	MySqlSelectBuilder,
	MySqlUpdateBuilder,
	QueryBuilder,
} from './query-builders/index.ts';
import { RelationalQueryBuilder } from './query-builders/query.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type {
	Mode,
	MySqlSession,
	MySqlTransaction,
	MySqlTransactionConfig,
	PreparedQueryHKTBase,
	QueryResultHKT,
	QueryResultKind,
} from './session.ts';
import type { WithSubqueryWithSelection } from './subquery.ts';
import type { MySqlTable } from './table.ts';
import { WithSubquery } from '~/subquery.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';

export class MySqlDatabase<
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = {},
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'MySqlDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly tableNamesMap: Record<string, string>;
	};

	query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: RelationalQueryBuilder<TPreparedQueryHKT, TSchema, TSchema[K]>;
		};

	constructor(
		/** @internal */
		readonly dialect: MySqlDialect,
		/** @internal */
		readonly session: MySqlSession<any, any, any, any>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
		protected readonly mode: Mode,
	) {
		this._ = schema
			? { schema: schema.schema, tableNamesMap: schema.tableNamesMap }
			: { schema: undefined, tableNamesMap: {} };
		this.query = {} as typeof this['query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				(this.query as MySqlDatabase<TQueryResult, TPreparedQueryHKT, Record<string, any>>['query'])[tableName] =
					new RelationalQueryBuilder(
						schema!.fullSchema,
						this._.schema,
						this._.tableNamesMap,
						schema!.fullSchema[tableName] as MySqlTable,
						columns,
						dialect,
						session,
						this.mode,
					);
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

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): MySqlSelectBuilder<undefined, TPreparedQueryHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlSelectBuilder<TSelection, TPreparedQueryHKT>;
		function select(fields?: SelectedFields): MySqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new MySqlSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		function selectDistinct(): MySqlSelectBuilder<undefined, TPreparedQueryHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlSelectBuilder<TSelection, TPreparedQueryHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): MySqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new MySqlSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): MySqlSelectBuilder<undefined, TPreparedQueryHKT>;
	select<TSelection extends SelectedFields>(fields: TSelection): MySqlSelectBuilder<TSelection, TPreparedQueryHKT>;
	select(fields?: SelectedFields): MySqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new MySqlSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
	}

	selectDistinct(): MySqlSelectBuilder<undefined, TPreparedQueryHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): MySqlSelectBuilder<TSelection, TPreparedQueryHKT>;
	selectDistinct(fields?: SelectedFields): MySqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new MySqlSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	update<TTable extends MySqlTable>(table: TTable): MySqlUpdateBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends MySqlTable>(table: TTable): MySqlInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends MySqlTable>(table: TTable): MySqlDeleteBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlDeleteBase(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = ResultSetHeader>(
		query: SQLWrapper,
	): Promise<QueryResultKind<TQueryResult, T>> {
		return this.session.execute(query.getSQL());
	}

	transaction<T>(
		transaction: (
			tx: MySqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>,
			config?: MySqlTransactionConfig,
		) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}

export type MySQLWithReplicas<Q> = Q & { $primary: Q };

export const withReplicas = <
	HKT extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
	Q extends MySqlDatabase<
		HKT,
		TPreparedQueryHKT,
		TFullSchema,
		TSchema extends Record<string, unknown> ? ExtractTablesWithRelations<TFullSchema> : TSchema
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): MySQLWithReplicas<Q> => {
	const select: Q['select'] = (...args: any) => getReplica(replicas).select(args);
	const selectDistinct: Q['selectDistinct'] = (...args: any) => getReplica(replicas).selectDistinct(args);
	const $with: Q['with'] = (...args: any) => getReplica(replicas).with(args);

	const update: Q['update'] = (...args: any) => primary.update(args);
	const insert: Q['insert'] = (...args: any) => primary.insert(args);
	const $delete: Q['delete'] = (...args: any) => primary.delete(args);
	const execute: Q['execute'] = (...args: any) => primary.execute(args);
	const transaction: Q['transaction'] = (...args: any) => primary.transaction(args);

	return new Proxy<Q & { $primary: Q }>(
		{
			...primary,
			update,
			insert,
			delete: $delete,
			execute,
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
