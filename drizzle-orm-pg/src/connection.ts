import { Column, Connector, Dialect, Driver, Session, sql } from 'drizzle-orm';
import { Name, SQL, SQLResponse } from 'drizzle-orm/sql';
import { tableColumns, TableName, tableName } from 'drizzle-orm/utils';
import { Client, Pool, PoolClient, QueryResult, types } from 'pg';

import { AnyPgColumn } from './columns';
import { PgSelectFields, PgSelectFieldsOrdered, PgTableOperations } from './operations';
import {
	AnyPgInsertConfig,
	PgDeleteConfig,
	PgSelectConfig,
	PgUpdateConfig,
	PgUpdateSet,
} from './queries';
import { AnyPgSQL } from './sql';
import { AnyPgTable } from './table';
import { getTableColumns } from './utils';

export type PgDriverParam = string | number | boolean | null | Record<string, unknown> | Date;

export type PgClient = Pool | PoolClient | Client;

export interface PgSession extends Session<PgDriverParam, Promise<QueryResult>> {}

export class PgSessionDefault implements PgSession {
	constructor(private client: PgClient) {}

	public async query(query: string, params: unknown[]): Promise<QueryResult> {
		console.log({ query, params });
		const result = await this.client.query({
			rowMode: 'array',
			text: query,
			values: params,
		});
		return result;
	}
}

export class PgDriver implements Driver<PgSession> {
	constructor(private client: PgClient) {
		this.initMappers();
	}

	async connect(): Promise<PgSession> {
		return new PgSessionDefault(this.client);
	}

	public initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export class PgDialect<TDBSchema extends Record<string, AnyPgTable>>
	implements Dialect<PgSession, PGDatabase<TDBSchema>>
{
	constructor(private schema: TDBSchema) {}

	createDB(session: PgSession): PGDatabase<TDBSchema> {
		return this.createPGDB(this.schema, session);
	}

	createPGDB(schema: TDBSchema, session: PgSession): PGDatabase<TDBSchema> {
		return Object.fromEntries(
			Object.entries(schema).map(([tableName, table]) => {
				return [
					tableName,
					new PgTableOperations(table, session, this as unknown as AnyPgDialect),
				];
			}),
		) as unknown as PGDatabase<TDBSchema>;
	}

	public escapeName(name: string): string {
		return `"${name}"`;
	}

	public escapeParam(num: number): string {
		return `$${num}`;
	}

	public buildDeleteQuery<TTable extends AnyPgTable>({
		table,
		where,
		returning,
	}: PgDeleteConfig<TTable>): AnyPgSQL<TableName<TTable>> {
		const returningStatement = returning
			? sql.fromList(this.prepareTableFieldsForQuery(returning))
			: undefined;

		return sql`delete from ${table} ${
			where ? sql`where ${where}` : undefined
		} ${returningStatement}` as AnyPgSQL<TableName<TTable>>;
	}

	buildUpdateSet(table: AnyPgTable, set: PgUpdateSet<AnyPgTable>): AnyPgSQL {
		const setEntries = Object.entries(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.map(([colName, value], i): AnyPgSQL[] => {
					const col = table[tableColumns][colName]!;
					const res = sql`${new Name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				})
				.flat(1),
		);
	}

	orderSelectedFields(fields: PgSelectFields<string>): PgSelectFieldsOrdered {
		return Object.entries(fields).map(([name, column]) => ({
			name,
			column,
		}));
	}

	public buildUpdateQuery<TTable extends AnyPgTable>({
		table,
		set,
		where,
		returning,
	}: PgUpdateConfig<TTable>): SQL<TableName<TTable>> {
		const setSql = this.buildUpdateSet(table, set);

		const returningStatement = returning
			? sql`returning ${sql.fromList(this.prepareTableFieldsForQuery(returning))}`
			: undefined;

		return sql`update ${table} set ${setSql} ${
			where ? sql`where ${where}` : undefined
		} ${returningStatement}`;
	}

	private prepareTableFieldsForQuery(columns: PgSelectFieldsOrdered): unknown[] {
		const columnsLen = columns.length;

		return columns
			.map(({ column }, i) => {
				const chunk: unknown[] = [];

				if (column instanceof SQLResponse) {
					chunk.push(column.sql);
				} else if (column instanceof Column) {
					const columnTableName = column.table[tableName];
					chunk.push(column);
				}

				if (i < columnsLen - 1) {
					chunk.push(sql`, `);
				}

				return chunk;
			})
			.flat(1);
	}

	public buildSelectQuery({
		fields,
		where,
		table,
		joins,
		distinct,
		orderBy,
		limit,
		offset,
	}: PgSelectConfig): AnyPgSQL {
		const sqlFields = sql.fromList(this.prepareTableFieldsForQuery(fields));

		const joinsArray: AnyPgSQL[] = [];
		if (joins) {
			const joinKeys = Object.keys(joins);

			joinKeys.forEach((tableAlias, index) => {
				const joinMeta = joins[tableAlias]!;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${joinMeta.table} ${joinMeta.alias} on ${
						joinMeta.on
					}` as AnyPgSQL,
				);
				if (index < joinKeys.length - 1) {
					joinsArray.push(sql` `);
				}
			});
		}

		const orderByList: AnyPgSQL<string>[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		return sql`select ${sqlFields} from ${table} ${sql.fromList(joinsArray)} ${
			where ? sql`where ${where}` : undefined
		} ${orderBy.length > 0 ? sql.raw('order by') : undefined} ${sql.fromList(orderByList)} ${
			limit ? sql.raw(`limit ${limit}`) : undefined
		} ${offset ? sql.raw(`offset ${offset}`) : undefined}`;
	}

	public buildInsertQuery({ table, values, onConflict, returning }: AnyPgInsertConfig): AnyPgSQL {
		const joinedValues: (unknown | AnyPgSQL)[][] = [];
		const columns: Record<string, AnyPgColumn> = getTableColumns(table);
		const columnKeys = Object.keys(columns);
		const insertOrder = Object.values(columns).map((column) => new Name(column.name));

		values.forEach((value) => {
			const valueList: (unknown | AnyPgSQL)[] = [];
			columnKeys.forEach((key) => {
				const colValue = value[key];
				if (typeof colValue === 'undefined') {
					valueList.push(sql`default`);
				} else {
					valueList.push(colValue);
				}
			});
			joinedValues.push(valueList);
		});

		const returningStatement = returning
			? sql`returning ${sql.fromList(this.prepareTableFieldsForQuery(returning))}`
			: undefined;

		return sql`insert into ${table} ${insertOrder} values ${
			joinedValues.length === 1 ? joinedValues[0] : joinedValues
		} ${onConflict ? sql`on conflict ${onConflict}` : undefined} ${returningStatement}`;
	}

	public prepareSQL(sql: AnyPgSQL): [string, PgDriverParam[]] {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export type AnyPgDialect = PgDialect<Record<string, AnyPgTable>>;

export type PGDatabase<TSchema extends Record<string, AnyPgTable>> = {
	[TTableName in keyof TSchema & string]: TSchema[TTableName] extends AnyPgTable<TTableName>
		? PgTableOperations<TSchema[TTableName]>
		: never;
};

export class PgConnector<TDBSchema extends Record<string, AnyPgTable>>
	implements Connector<PgSession, PGDatabase<TDBSchema>>
{
	dialect: Dialect<PgSession, PGDatabase<TDBSchema>>;
	driver: Driver<PgSession>;

	constructor(client: PgClient, dbSchema: TDBSchema) {
		this.dialect = new PgDialect(dbSchema);
		this.driver = new PgDriver(client);
	}
}
