import { AnySQLResponse, Name, SQL, sql, SQLResponse } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableRowMapper } from 'drizzle-orm/utils';
import { QueryResult } from 'pg';

import { AnyPgColumn } from '~/columns/common';
import { AnyPgDialect, PgDriverParam, PgSession } from '~/connection';
import { Constraint } from '~/constraints';
import { PartialSelectResult, PgSelectFields } from '~/operations';
import { AnyPgTable, InferType, TableConflictConstraints } from '~/table';
import { tableConflictConstraints } from '~/utils';
import { PgUpdateSet } from './update';

export interface PgInsertConfig<TTable extends AnyPgTable> {
	table: TTable;
	values: Record<string, unknown | SQL<TableName<TTable>>>[];
	onConflict: SQL<TableName<TTable>> | undefined;
	returning: { name: string; column: AnyPgColumn | AnySQLResponse }[] | undefined;
}

export type AnyPgInsertConfig = PgInsertConfig<any>;

export class PgInsert<TTable extends AnyPgTable, TReturn = QueryResult<any>> {
	protected enforceCovariance!: {
		table: TTable;
	};

	private config: PgInsertConfig<TTable> = {} as PgInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: InferType<TTable, 'insert'>[],
		private session: PgSession,
		private dialect: AnyPgDialect,
	) {
		this.config.table = table;
		this.config.values = values;
	}

	public returning(): Pick<PgInsert<TTable, InferType<TTable>[]>, 'execute'>;
	public returning<TSelectedFields extends PgSelectFields<TableName<TTable>>>(
		fields: TSelectedFields,
	): Pick<PgInsert<TTable, PartialSelectResult<TableName<TTable>, TSelectedFields>[]>, 'execute'>;
	public returning(fields?: PgSelectFields<TableName<TTable>>): Pick<PgInsert<TTable, any>, 'execute'> {
		const fieldsToMap: Record<string, AnyPgColumn | AnySQLResponse> = fields ?? this.config.table[tableColumns];

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, column }),
		);

		return this;
	}

	onConflictDoNothing(
		target?:
			| SQL<TableName<TTable>>
			| ((
				constraints: TableConflictConstraints<TTable>,
			) => Constraint<TableName<TTable>>),
	): Pick<this, 'returning' | 'execute'> {
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
			| SQL<TableName<TTable>>
			| ((constraints: TableConflictConstraints<TTable>) => Constraint<TableName<TTable>>),
		set: PgUpdateSet<TTable>,
	): Pick<this, 'returning' | 'execute'> {
		const setSql = this.dialect.buildUpdateSet(this.config.table, set);

		if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do update set ${setSql}`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
		}
		return this;
	}

	async execute(): Promise<TReturn> {
		const query = this.dialect.buildInsertQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		const { returning } = this.config;
		if (returning) {
			return result.rows.map((row) => this.config.table[tableRowMapper](returning, row)) as TReturn;
		} else {
			return result as TReturn;
		}
	}
}
