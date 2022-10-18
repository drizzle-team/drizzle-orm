import { GetColumnData } from 'drizzle-orm';
import { Name, Param, PreparedQuery, SQL, sql } from 'drizzle-orm/sql';
import { mapResultRow, OneOrMany, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { Check } from '~/checks';
import { AnyPgColumn } from '~/columns/common';
import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { InferModel } from '~/table';
import { getTableColumns, getTableConflictConstraints } from '~/utils';
import { AnyPgTable, GetTableConfig, Index, TableConfig } from '..';
import { PgUpdateSet } from './update';

type ConflictConstraint<TTableName extends string> = Index<TTableName, any, true> | Check<TTableName>;

export interface PgInsertConfig {
	table: AnyPgTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: PgSelectFieldsOrdered;
}

export type PgInsertValue<TTable extends AnyPgTable> = {
	[Key in keyof InferModel<TTable, 'insert'>]: InferModel<TTable, 'insert'>[Key] | SQL;
};

export class PgInsert<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: PgInsertConfig;

	constructor(
		table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		this.config = {
			table,
			values: undefined!,
		};
	}

	values(...values: PgInsertValue<TTable>[]): Omit<PgInsert<TTable, TReturn>, 'values'> {
		this.config.values = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.config.table[tableColumns];
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

		return this;
	}

	public returning(): Pick<PgInsert<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Pick<PgInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: PgSelectFields<GetTableConfig<TTable, 'name'>>): PgInsert<TTable, any> {
		const fieldsToMap: PgSelectFields<GetTableConfig<TTable, 'name'>> = fields
			?? this.config.table[tableColumns] as Record<string, AnyPgColumn<{ tableName: GetTableConfig<TTable, 'name'> }>>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, field: column, resultTableName: this.config.table[tableNameSym] }),
		);

		return this;
	}

	onConflictDoNothing(
		target?:
			| SQL
			| ((
				constraints: GetTableConfig<TTable, 'conflictConstraints'>,
			) => ConflictConstraint<GetTableConfig<TTable, 'name'>>),
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		if (typeof target === 'undefined') {
			this.config.onConflict = sql`do nothing`;
		} else if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do nothing`;
		} else {
			const targetSql = new Name(target(getTableConflictConstraints(this.config.table as TTable)).name);
			this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(
		target:
			| SQL
			| ((
				constraints: GetTableConfig<TTable, 'conflictConstraints'>,
			) => ConflictConstraint<GetTableConfig<TTable, 'name'>>),
		set: PgUpdateSet<TTable>,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		const setSql = this.dialect.buildUpdateSet(this.config.table, set);

		if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do update set ${setSql}`;
		} else {
			const targetSql = new Name(target(getTableConflictConstraints(this.config.table as TTable)).name);
			this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
		}
		return this;
	}

	getQuery(): PreparedQuery {
		const query = this.dialect.buildInsertQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	async execute(): Promise<TReturn> {
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
