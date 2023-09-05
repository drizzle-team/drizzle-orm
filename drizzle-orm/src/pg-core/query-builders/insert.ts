import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { IndexColumn } from '~/pg-core/indexes.ts';
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
import type { Placeholder, Query, SQLWrapper } from '~/sql/index.ts';
import { Param, SQL, sql } from '~/sql/index.ts';
import { type InferModel, Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { mapUpdateSet, orderSelectedFields } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { PgUpdateSetSource } from './update.ts';

export interface PgInsertConfig<TTable extends PgTable = PgTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export type PgInsertValue<TTable extends PgTable> =
	& {
		[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL | Placeholder;
	}
	& {};

export class PgInsertBuilder<TTable extends PgTable, TQueryResult extends QueryResultHKT> {
	static readonly [entityKind]: string = 'PgInsertBuilder';

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	values(value: PgInsertValue<TTable>): PgInsert<TTable, TQueryResult>;
	values(values: PgInsertValue<TTable>[]): PgInsert<TTable, TQueryResult>;
	values(values: PgInsertValue<TTable> | PgInsertValue<TTable>[]): PgInsert<TTable, TQueryResult> {
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

		return new PgInsert(this.table, mappedValues, this.session, this.dialect);
	}
}

export interface PgInsert<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
> extends
	QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>,
	SQLWrapper
{}

export class PgInsert<
	TTable extends PgTable,
	TQueryResult extends QueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
> extends QueryPromise<TReturning extends undefined ? QueryResultKind<TQueryResult, never> : TReturning[]>
	implements SQLWrapper
{
	static readonly [entityKind]: string = 'PgInsert';

	declare _: {
		table: TTable;
		return: TReturning;
	};

	private config: PgInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: PgInsertConfig['values'],
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { table, values };
	}

	returning(): PgInsert<TTable, TQueryResult, InferModel<TTable>>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgInsert<TTable, TQueryResult, SelectResultFields<TSelectedFields>>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): PgInsert<TTable, any, any> {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}

	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			let targetColumn = '';
			targetColumn = Array.isArray(config.target)
				? config.target.map((it) => this.dialect.escapeName(it.name)).join(',')
				: this.dialect.escapeName(config.target.name);

			const whereSql = config.where ? sql` where ${config.where}` : undefined;
			this.config.onConflict = sql`(${sql.raw(targetColumn)}) do nothing${whereSql}`;
		}
		return this;
	}

	onConflictDoUpdate(config: {
		target: IndexColumn | IndexColumn[];
		where?: SQL;
		set: PgUpdateSetSource<TTable>;
	}): this {
		const whereSql = config.where ? sql` where ${config.where}` : undefined;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		let targetColumn = '';
		targetColumn = Array.isArray(config.target)
			? config.target.map((it) => this.dialect.escapeName(it.name)).join(',')
			: this.dialect.escapeName(config.target.name);
		this.config.onConflict = sql`(${sql.raw(targetColumn)}) do update set ${setSql}${whereSql}`;
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
