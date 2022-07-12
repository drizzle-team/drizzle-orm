import { Connector, Driver, Dialect, sql, Column } from 'drizzle-orm';
import { SQL, raw, ParamValue, Chunk, SQLSourceParam } from 'drizzle-orm/sql';
import { getTableColumns } from 'drizzle-orm/utils';

import { AnyPgColumn } from './columns';
import { PgTableOperations } from './operations';
import { PgUpdateConfig, AnyPgSelectConfig, AnyPgInsertConfig } from './queries';
import { AnyPgTable } from './table';

export interface PgDriverResponse {
	rows: any[];
	rowCount: number;
	command: string;
}

interface Pool {}

export class PgSession<TDBSchema extends Record<string, AnyPgTable>> {
	constructor(private pool: Pool, private dbSchema: TDBSchema) {}

	public async query(query: string, params: unknown[]): Promise<PgDriverResponse> {
		console.log({ query, params });
		return {
			rows: [],
			rowCount: 0,
			command: '',
		};
		// const result = await this.pool.query(query);
		// return {
		// 	rows: result.rows,
		// 	rowCount: result.rowCount,
		// 	command: result.command,
		// };
	}
}

export class PgDriver<TDBSchema extends Record<string, AnyPgTable>>
	implements Driver<PgSession<TDBSchema>>
{
	constructor(private pool: Pool, private dbSchema: TDBSchema) {}

	async connect(): Promise<PgSession<TDBSchema>> {
		return new PgSession(this.pool, this.dbSchema);
	}
}

export class PgDialect<TDBSchema extends Record<string, AnyPgTable>>
	implements Dialect<PgSession<TDBSchema>, PGDatabase<TDBSchema>>
{
	constructor(private schema: TDBSchema) {}

	createDB(session: PgSession<TDBSchema>): PGDatabase<TDBSchema> {
		return this.createPGDB(this.schema, session);
	}

	createPGDB(schema: TDBSchema, session: PgSession<TDBSchema>): PGDatabase<TDBSchema> {
		return Object.fromEntries(
			Object.entries(schema).map(([tableName, table]) => {
				return [tableName, new PgTableOperations(table, session, this)];
			}),
		) as PGDatabase<TDBSchema>;
	}

	public escapeName(name: string): string {
		return `"${name}"`;
	}

	public escapeParam(num: number): string {
		return `$${num}`;
	}

	public buildUpdateQuery({ table, set, where, returning }: PgUpdateConfig<AnyPgTable>): SQL {
		return sql`update ${table} set ${set} ${where ? sql`where ${where}` : undefined} ${
			returning ? raw('returning *') : undefined
		}`;
	}

	public buildSelectQuery({ fields, where, table }: AnyPgSelectConfig): SQL {
		let sqlFields: SQL;
		if (fields) {
			let sqlFieldsList: SQL[] = [];
			Object.values(fields).forEach((field, i) => {
				if (field instanceof SQL) {
					sqlFieldsList.push(field);
				} else if (field instanceof Column) {
					sqlFieldsList.push(sql`${field}`);
				}

				if (i < Object.values(fields).length - 1) {
					sqlFieldsList.push(raw(', '));
				}
			});

			sqlFields = sql.fromList(sqlFieldsList);
		} else {
			sqlFields = raw('*');
		}

		return sql`select ${sqlFields} from ${table} ${where ? sql`where ${where}` : undefined}`;
	}

	public buildInsertQuery({ table, values, returning }: AnyPgInsertConfig): SQL {
		const joinedValues: (ParamValue | SQL)[][] = [];
		const columns = getTableColumns(table);
		const columnKeys = Object.keys(columns);
		const insertOrder = Object.values(columns);

		values.forEach((value) => {
			const valueList: (ParamValue | SQL)[] = [];
			columnKeys.forEach((key) => {
				const colValue = value[key];
				if (typeof colValue === 'undefined') {
					valueList.push(raw('default'));
				} else {
					valueList.push(colValue);
				}
			});
			joinedValues.push(valueList);
		});

		return sql`insert into ${table} ${insertOrder} values ${
			joinedValues.length === 1 ? joinedValues[0] : joinedValues
		} ${returning ? raw('returning *') : undefined}`;
	}

	public prepareSQL(sql: SQL): [string, ParamValue[]] {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export type AnyPgDialect = PgDialect<Record<string, AnyPgTable>>;

export type PGDatabase<TSchema extends Record<string, AnyPgTable>> = {
	[TTableName in keyof TSchema & string]: PgTableOperations<TSchema[TTableName]>;
};

export class PgConnector<TDBSchema extends Record<string, AnyPgTable>>
	implements Connector<PgSession<TDBSchema>, PGDatabase<TDBSchema>>
{
	dialect: Dialect<PgSession<TDBSchema>, PGDatabase<TDBSchema>>;
	driver: Driver<PgSession<TDBSchema>>;

	constructor(pool: Pool, dbSchema: TDBSchema) {
		this.dialect = new PgDialect(dbSchema);
		this.driver = new PgDriver(pool, dbSchema);
	}
}
