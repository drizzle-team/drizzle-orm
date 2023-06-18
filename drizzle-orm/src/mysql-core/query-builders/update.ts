import type { GetColumnData } from '~/column';
import { entityKind } from '~/entity';
import type { MySqlDialect } from '~/mysql-core/dialect';
import type {
	MySqlSession,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	QueryResultHKT,
	QueryResultKind,
} from '~/mysql-core/session';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { QueryPromise } from '~/query-promise';
import type { Query, SQL, SQLWrapper } from '~/sql';
import { mapUpdateSet, type Simplify, type UpdateSet } from '~/utils';
import type { SelectedFieldsOrdered } from './select.types';

export interface MySqlUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: AnyMySqlTable;
	returning?: SelectedFieldsOrdered;
}

export type MySqlUpdateSetSource<TTable extends AnyMySqlTable> = Simplify<
	{
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
>;

export class MySqlUpdateBuilder<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'MySqlUpdateBuilder';

	declare protected $table: TTable;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	set(values: MySqlUpdateSetSource<TTable>): MySqlUpdate<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MySqlUpdate(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export interface MySqlUpdate<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends QueryPromise<QueryResultKind<TQueryResult, never>>, SQLWrapper {}
export class MySqlUpdate<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlUpdate';

	declare protected $table: TTable;

	private config: MySqlUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { set, table };
	}

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Omit<Query, 'typings'> {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare() {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
		) as PreparedQueryKind<
			TPreparedQueryHKT,
			PreparedQueryConfig & {
				execute: QueryResultKind<TQueryResult, never>;
				iterator: never;
			},
			true
		>;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();
}
