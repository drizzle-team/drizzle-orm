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
import type { SelectedFieldsOrdered } from './select.types';

export interface MySqlDeleteConfig {
	where?: SQL | undefined;
	table: AnyMySqlTable;
	returning?: SelectedFieldsOrdered;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MySqlDelete<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> {}

export class MySqlDelete<
	TTable extends AnyMySqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlDelete';

	private config: MySqlDeleteConfig;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { table };
	}

	where(
		where: SQL | undefined,
	): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
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
