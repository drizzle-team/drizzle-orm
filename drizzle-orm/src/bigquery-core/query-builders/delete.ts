import type { BigQueryDialect } from '~/bigquery-core/dialect.ts';
import type {
	BigQueryPreparedQuery,
	BigQueryQueryResultHKT,
	BigQueryQueryResultKind,
	BigQuerySession,
	PreparedQueryConfig,
} from '~/bigquery-core/session.ts';
import type { BigQueryTable } from '~/bigquery-core/table.ts';
import { entityKind, is } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { tracer } from '~/tracing.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface BigQueryDeleteConfig {
	table: BigQueryTable;
	where?: SQL;
	withList?: Subquery[];
}

export type BigQueryDeleteWithout<
	T extends AnyBigQueryDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		BigQueryDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['dynamic'],
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type BigQueryDeletePrepare<T extends AnyBigQueryDeleteBase> = BigQueryPreparedQuery<
	PreparedQueryConfig & {
		execute: BigQueryQueryResultKind<T['_']['queryResult'], never>;
	}
>;

export type BigQueryDeleteDynamic<T extends AnyBigQueryDeleteBase> = BigQueryDeleteBase<
	T['_']['table'],
	T['_']['queryResult'],
	true,
	never
>;

export type AnyBigQueryDeleteBase = BigQueryDeleteBase<any, any, any, any>;

// BigQuery DELETE doesn't support RETURNING clause
export class BigQueryDeleteBase<
	TTable extends BigQueryTable,
	TQueryResult extends BigQueryQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<BigQueryQueryResultKind<TQueryResult, never>> {
	static override readonly [entityKind]: string = 'BigQueryDelete';

	declare readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};

	private config: BigQueryDeleteConfig;

	constructor(
		table: TTable,
		private session: BigQuerySession,
		private dialect: BigQueryDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, withList };
	}

	where(
		where: SQL | undefined,
	): BigQueryDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(name: string): BigQueryDeletePrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(
				this.dialect.sqlToQuery(this.getSQL()),
				undefined,
				name,
				false,
			) as BigQueryDeletePrepare<this>;
		});
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this.prepare('execute').execute(placeholderValues);
		});
	};

	$dynamic(): BigQueryDeleteDynamic<this> {
		return this as any;
	}
}
