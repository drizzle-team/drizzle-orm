import { Column, Connector, Dialect, Driver, MigrationMeta, Session, sql } from 'drizzle-orm';
import { ColumnData, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { Name, SQL, SQLResponse, SQLSourceParam } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName } from 'drizzle-orm/utils';
import { Connection, FieldPacket, Pool } from 'mysql2/promise';
import { Simplify } from 'type-fest';

import { AnyMySqlColumn, MySqlColumn } from './columns/common';
import { MySqlSelectFields, MySqlSelectFieldsOrdered, MySqlTableOperations } from './operations';
import {
	AnyMySqlInsertConfig,
	MySqlDeleteConfig,
	MySqlSelectConfig,
	MySqlUpdateConfig,
	MySqlUpdateSet,
} from './queries';
import { AnyMySQL, MySqlPreparedQuery } from './sql';
import { AnyMySqlTable } from './table';

// TODO: improve type
export type MySqlQueryResult = [any, FieldPacket[]];

export type MySqlColumnDriverDataType =
	| string
	| number
	| bigint
	| boolean
	| null
	| Record<string, unknown>
	| Date;

export type MySqlClient = Pool | Connection;

export interface MySqlSession extends Session<MySqlColumnDriverDataType, Promise<MySqlQueryResult>> {
	queryObjects(query: string, params: unknown[]): Promise<MySqlQueryResult>;
}

export class MySqlSessionDefault implements MySqlSession {
	constructor(private client: MySqlClient) {}

	public async query(query: string, params: unknown[]): Promise<MySqlQueryResult> {
		const result = await this.client.query({
			sql: query,
			values: params,
			rowsAsArray: true,
			typeCast: function(field: any, next: any) {
				if (field.type === 'TIMESTAMP') {
					return field.string();
				}
				return next();
			},
		});
		return result;
	}

	public async queryObjects<T extends MySqlQueryResult = MySqlQueryResult>(
		query: string,
		params: unknown[],
	): Promise<MySqlQueryResult> {
		return this.client.query<T>(query, params);
	}
}

export class MySqlQueryResultDriver implements Driver<MySqlSession> {
	constructor(private client: MySqlClient) {
		// this.initMappers();
	}

	async connect(): Promise<MySqlSession> {
		return new MySqlSessionDefault(this.client);
	}

	// public initMappers() {
	// 	types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
	// 	types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
	// 	types.setTypeParser(types.builtins.DATE, (val) => val);
	// }
}

export class MySqlDialect<TDBSchema extends Record<string, AnyMySqlTable>>
	implements Dialect<MySqlSession, MySqlDatabase<TDBSchema>>
{
	constructor(private schema: TDBSchema) {}

	async migrate(migrations: MigrationMeta[], session: MySqlSession): Promise<void> {
		const migrationTableCreate = `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)`
			.trim()
			.replace(/\s{2,}/, ' ')
			.replace(/\n+/g, '')
			.replace(/ +/g, ' ');
		await session.query('CREATE SCHEMA IF NOT EXISTS "drizzle"', []);
		await session.query(migrationTableCreate, []);

		const dbMigrations = await session.query(
			`SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
			[],
		);

		const lastDbMigration = dbMigrations[0][0] ?? undefined;
		await session.query('BEGIN;', []);

		try {
			for await (const migration of migrations) {
				if (
					!lastDbMigration
					|| parseInt(lastDbMigration[2], 10)! < migration.folderMillis
				) {
					await session.query(migration.sql, []);
					await session.query(
						`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES('${migration.hash}', ${migration.folderMillis})`,
						[],
					);
				}
			}

			await session.query('COMMIT;', []);
		} catch (e) {
			await session.query('ROLLBACK;', []);
			throw e;
		}
	}

	private buildTableNamesMap(): Record<string, string> {
		return Object.entries(this.schema).reduce<Record<string, string>>((acc, [tName, table]) => {
			acc[table[tableName]] = tName;
			return acc;
		}, {});
	}

	createDB(session: MySqlSession): MySqlDatabase<TDBSchema> {
		return this.createMySqlDB(session);
	}

	createMySqlDB(session: MySqlSession): MySqlDatabase<TDBSchema> {
		return Object.assign(
			Object.fromEntries(
				Object.entries(this.schema).map(([tableName, table]) => {
					return [
						tableName,
						new MySqlTableOperations(
							table,
							session,
							this as unknown as AnyMySqlDialect,
							this.buildTableNamesMap(),
						),
					];
				}),
			),
			{
				execute: (query: MySqlPreparedQuery | AnyMySQL): Promise<MySqlQueryResult> => {
					const preparedQuery = query instanceof SQL ? this.prepareSQL(query) : query;
					return session.queryObjects(preparedQuery.sql, preparedQuery.params);
				},
			},
		) as unknown as MySqlDatabase<TDBSchema>;
	}

	public escapeName(name: string): string {
		return `\`${name}\``;
	}

	public escapeParam(num: number): string {
		return `?`;
	}

	public buildDeleteQuery({
		table,
		where,
		returning,
	}: MySqlDeleteConfig): AnyMySQL {
		const returningSql = returning
			? sql.fromList([
				sql` returning `,
				...this.prepareTableFieldsForQuery(returning, { isSingleTable: true }),
			])
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet<TTableName extends TableName>(
		table: AnyMySqlTable,
		set: MySqlUpdateSet<AnyMySqlTable>,
	): AnyMySQL<TTableName> {
		const setEntries = Object.entries<ColumnData | AnyMySQL<TTableName>>(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.map(([colName, value], i): AnyMySQL<TTableName>[] => {
					const col = table[tableColumns][colName]!;
					const res = sql<TTableName>`${new Name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				})
				.flat(1),
		);
	}

	orderSelectedFields<TTableName extends TableName>(
		fields: MySqlSelectFields<TTableName>,
		resultTableName: string,
	): MySqlSelectFieldsOrdered<TTableName> {
		return Object.entries(fields).map(([name, column]) => ({
			name,
			resultTableName,
			column,
		}));
	}

	public buildUpdateQuery({
		table,
		set,
		where,
		returning,
	}: MySqlUpdateConfig): AnyMySQL {
		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${
				sql.fromList(
					this.prepareTableFieldsForQuery(returning, { isSingleTable: true }),
				)
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`update ${table} set ${setSql}${whereSql}${returningSql}`;
	}

	private prepareTableFieldsForQuery(
		columns: MySqlSelectFieldsOrdered,
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQLSourceParam<TableName>[] {
		const columnsLen = columns.length;

		return columns
			.map(({ column }, i) => {
				const chunk: SQLSourceParam<TableName>[] = [];

				if (column instanceof SQLResponse) {
					if (isSingleTable) {
						chunk.push(
							new SQL(
								column.sql.queryChunks.map((c) => {
									if (c instanceof MySqlColumn) {
										return new Name(c.name);
									}
									return c;
								}),
							),
						);
					} else {
						chunk.push(column.sql);
					}
				} else if (column instanceof Column) {
					if (isSingleTable) {
						chunk.push(new Name(column.name));
					} else {
						chunk.push(column);
					}
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
		orderBy,
		limit,
		offset,
	}: MySqlSelectConfig): AnyMySQL {
		const joinKeys = Object.keys(joins);

		const fieldsSql = sql.fromList(
			this.prepareTableFieldsForQuery(fields, { isSingleTable: joinKeys.length === 0 }),
		);

		const joinsArray: AnyMySQL[] = [];

		joinKeys.forEach((tableAlias, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const joinMeta = joins[tableAlias]!;
			const alias = joinMeta.aliasTable[tableName] === joinMeta.table[tableName]
				? undefined
				: joinMeta.aliasTable;
			joinsArray.push(sql`${sql.raw(joinMeta.joinType)} join ${joinMeta.table} ${alias} on ${joinMeta.on}`);
			if (index < joinKeys.length - 1) {
				joinsArray.push(sql` `);
			}
		});

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderByList: AnyMySQL[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`select ${fieldsSql} from ${table}${joinsSql}${whereSql}${orderBySql}${limitSql}${offsetSql}`;
	}

	public buildInsertQuery({
		table,
		values,
		onConflict,
		returning,
	}: AnyMySqlInsertConfig): AnyMySQL {
		const valuesSqlList: ((SQLSourceParam<TableName> | AnyMySQL)[] | AnyMySQL)[] = [];
		const columns: Record<string, AnyMySqlColumn> = table[tableColumns];
		const columnKeys = Object.keys(columns);
		const insertOrder = Object.values(columns).map((column) => new Name(column.name));

		values.forEach((value, valueIndex) => {
			const valueList: (SQLSourceParam<TableName> | AnyMySQL)[] = [];
			columnKeys.forEach((key) => {
				const colValue = value[key];
				if (typeof colValue === 'undefined') {
					valueList.push(sql`default`);
				} else {
					valueList.push(colValue);
				}
			});
			valuesSqlList.push(valueList);
			if (valueIndex < values.length - 1) {
				valuesSqlList.push(sql`, `);
			}
		});

		const valuesSql = sql.fromList(valuesSqlList);

		const returningSql = returning
			? sql` returning ${
				sql.fromList(
					this.prepareTableFieldsForQuery(returning, { isSingleTable: true }),
				)
			}`
			: undefined;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`insert into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}${returningSql}`;
	}

	public prepareSQL(sql: AnyMySQL): MySqlPreparedQuery {
		return sql.toQuery<MySqlColumnDriverDataType>({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export type AnyMySqlDialect = MySqlDialect<Record<string, AnyMySqlTable>>;

export type BuildTableNamesMap<TSchema extends Record<string, AnyMySqlTable>> = {
	[Key in keyof TSchema & string as Unwrap<GetTableName<TSchema[Key]>>]: Key;
};

export type MySqlDatabase<TSchema extends Record<string, AnyMySqlTable>> = Simplify<
	{
		[TTableName in keyof TSchema & string]: TSchema[TTableName] extends AnyMySqlTable<TableName>
			? MySqlTableOperations<TSchema[TTableName], BuildTableNamesMap<TSchema>>
			: never;
	} & {
		execute: <T extends MySqlQueryResult = MySqlQueryResult>(
			query: MySqlPreparedQuery | AnyMySQL,
		) => Promise<T>;
	},
	{ deep: true }
>;

export class MySqlConnector<TDBSchema extends Record<string, AnyMySqlTable>>
	implements Connector<MySqlSession, MySqlDatabase<TDBSchema>>
{
	dialect: Dialect<MySqlSession, MySqlDatabase<TDBSchema>>;
	driver: Driver<MySqlSession>;

	constructor(client: MySqlClient, dbSchema: TDBSchema) {
		this.dialect = new MySqlDialect(dbSchema);
		this.driver = new MySqlQueryResultDriver(client);
	}
}
