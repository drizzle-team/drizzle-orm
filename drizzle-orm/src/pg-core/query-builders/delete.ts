import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type {
	PgSession,
	PreparedQuery,
	PreparedQueryConfig,
	QueryResultHKT,
	QueryResultKind,
} from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { orderSelectedFields } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export type PgDeleteWithout<
	T extends AnyPgDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		PgDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type PgDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgDeleteBase<TTable, TQueryResult, TReturning, true, never>;

export interface PgDeleteConfig {
	where?: SQL | undefined;
	table: PgTable;
	returning?: SelectedFieldsOrdered;
}

export type PgDeleteReturningAll<
	T extends AnyPgDeleteBase,
	TDynamic extends boolean,
> = PgDeleteWithout<
	PgDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type PgDeleteReturning<
	T extends AnyPgDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = PgDeleteWithout<
	PgDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type PgDeletePrepare<T extends AnyPgDeleteBase> = PreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? QueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type PgDeleteDynamic<T extends AnyPgDeleteBase> = PgDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type AnyPgDeleteBase = PgDeleteBase<any, any, any, any, any>;

export interface PgDeleteBase<
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]> {
	readonly _: {
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class PgDeleteBase<
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>
	implements SQLWrapper
{
	static readonly [entityKind]: string = 'PgDelete';

	private config: PgDeleteConfig;

	constructor(
		table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { table };
	}

	where(where: SQL | undefined): PgDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	returning(): PgDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): PgDeleteReturning<this, TDynamic, any> {
		this.config.returning = orderSelectedFields(fields);
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

	private _prepare(name?: string): PgDeletePrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name);
		});
	}

	prepare(name: string): PgDeletePrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};

	$dynamic(): PgDeleteDynamic<this> {
		return this as any;
	}
}
