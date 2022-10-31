import { Name, Param, PreparedQuery, SQL, sql, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { Check } from '~/checks';
import { AnyPgColumn } from '~/columns/common';
import { PgDialect, PgSession } from '~/connection';
import { IndexColumn } from '~/indexes';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableConfig, InferModel, PgTable } from '~/table';
import { mapUpdateSet } from '~/utils';
import { QueryPromise } from './common';
import { PgUpdateSetSource } from './update';

export interface PgInsertConfig<TTable extends AnyPgTable = AnyPgTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: PgSelectFieldsOrdered;
}

export type PgInsertValue<TTable extends AnyPgTable> = {
	[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL;
};

export class PgInsertBuilder<TTable extends AnyPgTable> {
	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {}

	values(...values: PgInsertValue<TTable>[]): PgInsert<TTable> {
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[PgTable.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				if (colValue instanceof SQL) {
					result[colKey] = colValue;
				} else {
					result[colKey] = new Param(colValue, cols[colKey]);
				}
			}
			return result;
		});

		return new PgInsert(this.table, mappedValues, this.session, this.dialect);
	}
}

export class PgInsert<TTable extends AnyPgTable, TReturn = QueryResult<any>> extends QueryPromise<TReturn>
	implements SQLWrapper
{
	declare protected $table: TTable;
	declare protected $return: TReturn;

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

	public returning(): Omit<PgInsert<TTable, InferModel<TTable>[]>, 'returning' | `onConflict${string}`>;
	public returning<TSelectedFields extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Omit<PgInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'returning' | `onConflict${string}`>;
	public returning(fields?: PgSelectFields<GetTableConfig<TTable, 'name'>>): PgInsert<TTable, any> {
		const fieldsToMap: PgSelectFields<GetTableConfig<TTable, 'name'>> = fields
			?? this.config.table[PgTable.Symbol.Columns] as Record<
				string,
				AnyPgColumn<{ tableName: GetTableConfig<TTable, 'name'> }>
			>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, field: column, resultTableName: this.config.table[PgTable.Symbol.Name] }),
		);

		return this;
	}

	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict = sql`${config.target}${whereSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(config: {
		target?: IndexColumn | IndexColumn[];
		where?: SQL;
		set: PgUpdateSetSource<TTable>;
	}): this {
		const whereSql = config.where ? sql` where ${config.where}` : sql``;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`${config.target}${whereSql} do update set ${setSql}`;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	getQuery(): PreparedQuery {
		return this.dialect.prepareSQL(this.getSQL());
	}

	protected override async execute(): Promise<TReturn> {
		const query = this.dialect.buildInsertQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		const { returning } = this.config;
		if (returning) {
			return result.rows.map((row) => mapResultRow(returning, row)) as TReturn;
		} else {
			return result as TReturn;
		}
	}
}
