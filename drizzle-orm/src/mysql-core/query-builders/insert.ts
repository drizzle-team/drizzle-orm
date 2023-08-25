import { entityKind, is } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type {
	MySqlSession,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	QueryResultHKT,
	QueryResultKind,
} from '~/mysql-core/session.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/index.ts';
import { Param, SQL, sql } from '~/sql/index.ts';
import { type InferModel, Table } from '~/table.ts';
import { mapUpdateSet } from '~/utils.ts';
import type { MySqlUpdateSetSource } from './update.ts';

export interface MySqlInsertConfig<TTable extends MySqlTable = MySqlTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	ignore: boolean;
	onConflict?: SQL;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<MySqlTable>;

export type MySqlInsertValue<TTable extends MySqlTable> =
	& {
		[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
	}
	& {};

export class MySqlInsertBuilder<
	TTable extends MySqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'MySqlInsertBuilder';

	private shouldIgnore = false;

	constructor(
		private table: TTable,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {}

	ignore(): this {
		this.shouldIgnore = true;
		return this;
	}

	values(value: MySqlInsertValue<TTable>): MySqlInsert<TTable, TQueryResult, TPreparedQueryHKT>;
	values(values: MySqlInsertValue<TTable>[]): MySqlInsert<TTable, TQueryResult, TPreparedQueryHKT>;
	values(
		values: MySqlInsertValue<TTable> | MySqlInsertValue<TTable>[],
	): MySqlInsert<TTable, TQueryResult, TPreparedQueryHKT> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});

		return new MySqlInsert(this.table, mappedValues, this.shouldIgnore, this.session, this.dialect);
	}
}

export interface MySqlInsert<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends MySqlTable,
	TQueryResult extends QueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends QueryPromise<QueryResultKind<TQueryResult, never>>, SQLWrapper {}
export class MySqlInsert<
	TTable extends MySqlTable,
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends QueryPromise<QueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'MySqlInsert';

	declare protected $table: TTable;

	private config: MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: MySqlInsertConfig['values'],
		ignore: boolean,
		private session: MySqlSession,
		private dialect: MySqlDialect,
	) {
		super();
		this.config = { table, values, ignore };
	}

	onDuplicateKeyUpdate(config: {
		// target?: IndexColumn | IndexColumn[];
		set: MySqlUpdateSetSource<TTable>;
	}): this {
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`update ${setSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare() {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
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
