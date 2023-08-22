import { entityKind } from '~/entity';
import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import { type ExtractTablesWithRelations, type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import type { SQLWrapper } from '~/sql';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import {
	QueryBuilder,
	SQLiteDelete,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders';
import type { Result, SQLiteSession, SQLiteTransaction, SQLiteTransactionConfig } from '~/sqlite-core/session';
import type { SQLiteTable } from '~/sqlite-core/table';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type DrizzleTypeError } from '~/utils';
import { type ColumnsSelection } from '~/view';
import { RelationalQueryBuilder } from './query-builders/query';
import type { SelectedFields } from './query-builders/select.types';
import type { WithSubqueryWithSelection } from './subquery';

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
		resultKind: TResultKind,
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

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
		function select(fields?: SelectedFields): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		function selectDistinct(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
		function selectDistinct(
			fields?: SelectedFields,
		): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
	select(fields?: SelectedFields): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
	}

	selectDistinct(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
	selectDistinct(fields?: SelectedFields): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder({
			fields: fields ?? undefined,
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

	delete<TTable extends SQLiteTable>(from: TTable): SQLiteDelete<TTable, TResultKind, TRunResult> {
		return new SQLiteDelete(from, this.session, this.dialect);
	}

	run(query: SQLWrapper): Result<TResultKind, TRunResult> {
		return this.session.run(query.getSQL());
	}

	all<T = unknown>(query: SQLWrapper): Result<TResultKind, T[]> {
		return this.session.all(query.getSQL());
	}

	get<T = unknown>(query: SQLWrapper): Result<TResultKind, T> {
		return this.session.get(query.getSQL());
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper): Result<TResultKind, T[]> {
		return this.session.values(query.getSQL());
	}

	transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TSchema>) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T> {
		return this.session.transaction(transaction, config);
	}
}
