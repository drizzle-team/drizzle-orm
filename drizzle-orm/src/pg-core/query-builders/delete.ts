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
import type { Query, SQL, SQLWrapper } from '~/sql/index.ts';
import { type InferModel, Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { orderSelectedFields } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export interface PgDeleteConfig {
	where?: SQL | undefined;
	table: PgTable;
	returning?: SelectedFieldsOrdered;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PgDelete<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]> {}

export class PgDelete<
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
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

	where(where: SQL | undefined): Omit<this, 'where'> {
		this.config.where = where;
		return this;
	}

	returning(): PgDelete<TTable, TQueryResult, InferModel<TTable>>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgDelete<TTable, TQueryResult, SelectResultFields<TSelectedFields>>;
	returning(fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns]): PgDelete<TTable, any, any> {
		this.config.returning = orderSelectedFields(fields);
		return this as PgDelete<TTable, any>;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): { sql: Query['sql']; params: Query['params'] } {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	private _prepare(name?: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name);
		});
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[];
		}
	> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}
