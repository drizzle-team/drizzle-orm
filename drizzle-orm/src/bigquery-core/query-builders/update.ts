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
import { Param, sql } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import type { Simplify, UpdateSet } from '~/utils.ts';
import { mapUpdateSet } from '~/utils.ts';
import type { BigQueryColumn } from '../columns/common.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface BigQueryUpdateConfig {
	table: BigQueryTable;
	set: UpdateSet;
	where?: SQL;
	withList?: Subquery[];
}

export type BigQueryUpdateSetSource<TTable extends BigQueryTable> = Simplify<
	{
		[Key in keyof TTable['$inferInsert']]?:
			| TTable['$inferInsert'][Key]
			| SQL;
	}
>;

export class BigQueryUpdateBuilder<
	TTable extends BigQueryTable,
	TQueryResult extends BigQueryQueryResultHKT,
> {
	static readonly [entityKind]: string = 'BigQueryUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		private table: TTable,
		private session: BigQuerySession,
		private dialect: BigQueryDialect,
		private withList?: Subquery[],
	) {}

	set(
		values: BigQueryUpdateSetSource<TTable>,
	): BigQueryUpdateBase<TTable, TQueryResult> {
		return new BigQueryUpdateBase(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		);
	}
}

export type BigQueryUpdateWithout<
	T extends AnyBigQueryUpdateBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		BigQueryUpdateBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['dynamic'],
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type BigQueryUpdatePrepare<T extends AnyBigQueryUpdateBase> = BigQueryPreparedQuery<
	PreparedQueryConfig & {
		execute: BigQueryQueryResultKind<T['_']['queryResult'], never>;
	}
>;

export type BigQueryUpdateDynamic<T extends AnyBigQueryUpdateBase> = BigQueryUpdateBase<
	T['_']['table'],
	T['_']['queryResult'],
	true,
	never
>;

export type AnyBigQueryUpdateBase = BigQueryUpdateBase<any, any, any, any>;

// BigQuery UPDATE doesn't support RETURNING clause
export class BigQueryUpdateBase<
	TTable extends BigQueryTable,
	TQueryResult extends BigQueryQueryResultHKT,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<BigQueryQueryResultKind<TQueryResult, never>> {
	static override readonly [entityKind]: string = 'BigQueryUpdate';

	declare readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};

	private config: BigQueryUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: BigQuerySession,
		private dialect: BigQueryDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, set, withList };
	}

	where(
		where: SQL | undefined,
	): BigQueryUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(name: string): BigQueryUpdatePrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(
				this.dialect.sqlToQuery(this.getSQL()),
				undefined,
				name,
				false,
			) as BigQueryUpdatePrepare<this>;
		});
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this.prepare('execute').execute(placeholderValues);
		});
	};

	$dynamic(): BigQueryUpdateDynamic<this> {
		return this as any;
	}
}
