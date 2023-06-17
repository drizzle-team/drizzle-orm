import type { ResultSetHeader } from 'mysql2/promise';
import { entityKind } from '~/entity';
import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import { type ExtractTablesWithRelations, type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import type { SQLWrapper } from '~/sql';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type DrizzleTypeError } from '~/utils';
import { type ColumnsSelection } from '~/view';
import type { MySqlDialect } from './dialect';
import {
	MySqlDelete,
	MySqlInsertBuilder,
	MySqlSelectBuilder,
	MySqlUpdateBuilder,
	QueryBuilder,
} from './query-builders';
import { RelationalQueryBuilder } from './query-builders/query';
import type { SelectedFields } from './query-builders/select.types';
import type {
	MySqlSession,
	MySqlTransaction,
	MySqlTransactionConfig,
	PreparedQueryHKTBase,
	QueryResultHKT,
	QueryResultKind,
} from './session';
import type { WithSubqueryWithSelection } from './subquery';
import type { AnyMySqlTable } from './table';

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
						schema!.fullSchema[tableName] as AnyMySqlTable,
						columns,
						dialect,
						session,
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

	update<TTable extends AnyMySqlTable>(table: TTable): MySqlUpdateBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyMySqlTable>(table: TTable): MySqlInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyMySqlTable>(table: TTable): MySqlDelete<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlDelete(table, this.session, this.dialect);
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
