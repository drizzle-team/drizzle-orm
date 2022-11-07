import { ColumnData, ColumnDriverParam } from 'drizzle-orm/branded-types';
import { AnySQLResponse, SQL } from 'drizzle-orm/sql';
import { GetTableName, mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';
import { AnyMySqlColumn } from '~/columns/common';
import { AnyMySqlDialect, MySqlQueryResult, MySqlSession } from '~/connection';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { MySqlPreparedQuery } from '~/sql';
import { AnyMySqlTable, InferModel } from '~/table';
export interface MySqlInsertConfig<TTable extends AnyMySqlTable> {
	table: TTable;
	values: Record<string, ColumnData | SQL<GetTableConfig<TTable, 'name'>>>[];
	onConflict: SQL<GetTableConfig<TTable, 'name'>> | undefined;
	returning: MySqlSelectFieldsOrdered<GetTableConfig<TTable, 'name'>> | undefined;
}

export type AnyMySqlInsertConfig = MySqlInsertConfig<AnyMySqlTable>;

export class MySqlInsert<TTable extends AnyMySqlTable, TReturn = MySqlQueryResult> {
	protected typeKeeper!: {
		table: TTable;
		return: TReturn;
	};

	private config: MySqlInsertConfig<TTable> = {} as MySqlInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: InferModel<TTable, 'insert'>[],
		private session: MySqlSession,
		private dialect: AnyMySqlDialect,
	) {
		this.config.table = table;
		this.config.values = values as MySqlInsertConfig<TTable>['values'];
	}

	returning(): Pick<MySqlInsert<TTable, InferModel<TTable>[]>, 'getQuery' | 'execute'>;
	returning<TSelectedFields extends MySqlSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelectedFields,
	): Pick<MySqlInsert<TTable, SelectResultFields<TSelectedFields>[]>, 'getQuery' | 'execute'>;
	returning(fields?: MySqlSelectFields<GetTableConfig<TTable, 'name'>>): MySqlInsert<TTable, any> {
		const fieldsToMap: MySqlSelectFields<GetTableConfig<TTable, 'name'>> = fields
			?? this.config.table[tableColumns] as Record<string, AnyMySqlColumn<GetTableConfig<TTable, 'name'>>>;

		this.config.returning = Object.entries(fieldsToMap).map(
			([name, column]) => ({ name, column, resultTableName: this.config.table[tableNameSym] }),
		);

		return this;
	}

	// onDuplicateDoNothing(
	// 	target?:
	// 		| SQL<GetTableConfig<TTable, 'name'>>
	// 		| ((
	// 			constraints: GetTableConflictConstraints<TTable>,
	// 		) => Check<GetTableConfig<TTable, 'name'>>),
	// ): Pick<this, 'returning' | 'getQuery' | 'execute'> {
	// 	if (typeof target === 'undefined') {
	// 		this.config.onConflict = sql`do nothing`;
	// 	} else if (target instanceof SQL) {
	// 		this.config.onConflict = sql`${target} do nothing`;
	// 	} else {
	// 		const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
	// 		this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
	// 	}
	// 	return this;
	// }

	// onDuplicateDoUpdate(
	// 	target:
	// 		| SQL<GetTableConfig<TTable, 'name'>>
	// 		| ((constraints: GetTableConflictConstraints<TTable>) => Check<GetTableConfig<TTable, 'name'>>),
	// 	set: MySqlUpdateSet<TTable>,
	// ): Pick<this, 'returning' | 'getQuery' | 'execute'> {
	// 	const setSql = this.dialect.buildUpdateSet<GetTableConfig<TTable, 'name'>>(this.config.table, set);

	// 	if (target instanceof SQL) {
	// 		this.config.onConflict = sql<GetTableConfig<TTable, 'name'>>`${target} do update set ${setSql}`;
	// 	} else {
	// 		const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
	// 		this.config.onConflict = sql`on constraint ${targetSql} do update set ${setSql}`;
	// 	}
	// 	return this;
	// }

	getQuery(): MySqlPreparedQuery {
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
			return result[0].map((row: ColumnDriverParam[]) => mapResultRow(returning, row)) as TReturn;
		} else {
			return result as TReturn;
		}
	}
}
