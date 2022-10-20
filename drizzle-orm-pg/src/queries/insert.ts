import { Name, Param, PreparedQuery, SQL, sql, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { Check } from '~/checks';
import { AnyPgColumn } from '~/columns/common';
import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { InferModel } from '~/table';
import { mapUpdateSet } from '~/utils';
import { AnyPgTable, GetTableConfig, Index, PgTable } from '..';
import { QueryPromise } from './common';
import { PgUpdateSetSource } from './update';

type ConflictConstraint<TTableName extends string> = Index<TTableName, any, true> | Check<TTableName>;

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

export class PgInsert<
	TTable extends AnyPgTable,
	TReturn = QueryResult<any>,
> extends QueryPromise<TReturn> implements SQLWrapper {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
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

	onConflictDoNothing(
		target?:
			| SQL
			| ((
				constraints: GetTableConfig<TTable, 'conflictConstraints'>,
			) => ConflictConstraint<GetTableConfig<TTable, 'name'>>),
	): Omit<this, `onConflict${string}`> {
		if (typeof target === 'undefined') {
			this.config.onConflict = sql`do nothing`;
		} else if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do nothing`;
		} else {
			const targetSql = new Name(
				target(this.config.table[PgTable.Symbol.ConflictConstraints] as GetTableConfig<TTable, 'conflictConstraints'>)
					.name,
			);
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
		set: PgUpdateSetSource<TTable>,
	): Omit<this, `onConflict${string}`> {
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, set));

		if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do update set ${setSql}`;
		} else {
			const targetSql = new Name(
				target(this.config.table[PgTable.Symbol.ConflictConstraints] as GetTableConfig<TTable, 'conflictConstraints'>)
					.name,
			);
			this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
		}
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
