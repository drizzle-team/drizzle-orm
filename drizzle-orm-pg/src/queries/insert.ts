import { ColumnData, TableName } from 'drizzle-orm/branded-types';
import { AnySQLResponse, Name, SQL, sql } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableName } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { Check } from '~/checks';
import { AnyPgColumn } from '~/columns/common';
import { AnyPgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgSQL, PgPreparedQuery } from '~/sql';
import { AnyPgTable, GetTableConflictConstraints, InferModel } from '~/table';
import { tableConflictConstraints } from '~/utils';
import { Index } from '..';
import { PgUpdateSet } from './update';

type ConflictConstraint<TTableName extends TableName> = Index<TTableName, any, true> | Check<TTableName>;

export interface PgInsertConfig<TTable extends AnyPgTable> {
	table: TTable;
	values: Record<string, ColumnData | SQL<GetTableName<TTable>>>[];
	onConflict: SQL<GetTableName<TTable>> | undefined;
	returning: PgSelectFieldsOrdered | undefined;
}

export type AnyPgInsertConfig = PgInsertConfig<AnyPgTable>;

export class PgInsert<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: PgInsertConfig<TTable> = {} as PgInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: InferModel<TTable, 'insert'>[],
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {
		this.config.table = table;
		this.config.values = values as PgInsertConfig<TTable>['values'];
	}

	public returning(): Pick<PgInsert<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<GetTableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	public returning(fields?: PgSelectFields<GetTableName<TTable>>): PgInsert<TTable, any> {
		const fieldsToMap: PgSelectFields<GetTableName<TTable>> = fields
			?? this.config.table[tableColumns] as Record<string, AnyPgColumn<GetTableName<TTable>>>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, column, resultTableName: this.config.table[tableName] }),
		);

		return this;
	}

	onConflictDoNothing(
		target?:
			| SQL<GetTableName<TTable>>
			| ((
				constraints: GetTableConflictConstraints<TTable>,
			) => ConflictConstraint<GetTableName<TTable>>),
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		if (typeof target === 'undefined') {
			this.config.onConflict = sql`do nothing`;
		} else if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do nothing`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(
		target:
			| SQL<GetTableName<TTable>>
			| ((constraints: GetTableConflictConstraints<TTable>) => ConflictConstraint<GetTableName<TTable>>),
		set: PgUpdateSet<TTable>,
	): Pick<this, 'returning' | 'getQuery' | 'execute'> {
		const setSql = this.dialect.buildUpdateSet<GetTableName<TTable>>(this.config.table, set);

		if (target instanceof SQL) {
			this.config.onConflict = sql<GetTableName<TTable>>`${target} do update set ${setSql}`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
		}
		return this;
	}

	getQuery(): PgPreparedQuery {
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
