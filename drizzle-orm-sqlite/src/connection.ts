import { Database } from 'better-sqlite3';
import { Column, Connector, Dialect, MigrationMeta, sql, SyncDriver } from 'drizzle-orm';
import { ColumnData, TableName, Unwrap } from 'drizzle-orm/branded-types';
import { AnySQL, Name, SQL, SQLResponse, SQLSourceParam } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnySQLiteColumn, SQLiteColumn } from './columns';
import { SQLiteSelectFields, SQLiteSelectFieldsOrdered, SQLiteTableOperations } from './operations';
import {
	AnySQLiteInsertConfig,
	SQLiteDeleteConfig,
	SQLiteSelectConfig,
	SQLiteUpdateConfig,
	SQLiteUpdateSet,
} from './queries';
import { AnySQLiteSQL, SQLitePreparedQuery } from './sql';
import { AnySQLiteTable } from './table';

export type SQLiteColumnDriverDataType = null | number | bigint | string | Buffer;

export interface SQLiteSession {
	run(query: AnySQLiteSQL): void;
	all(query: AnySQLiteSQL): any[][];
	allObjects(query: AnySQLiteSQL): any[];
}

export class SQLiteSessionDefault implements SQLiteSession {
	constructor(private client: Database, private dialect: SQLiteDialect<any>) {}

	run(query: AnySQLiteSQL): void {
		const preparedQuery = this.dialect.prepareSQL(query);
		const stmt = this.client.prepare(preparedQuery.sql).bind(...preparedQuery.params);
		stmt.run();
	}

	all(query: AnySQLiteSQL): any[][] {
		const preparedQuery = this.dialect.prepareSQL(query);
		const stmt = this.client.prepare(preparedQuery.sql).bind(...preparedQuery.params);
		stmt.raw();
		return stmt.all();
	}

	allObjects(query: AnySQLiteSQL): any[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		const stmt = this.client.prepare(preparedQuery.sql).bind(...preparedQuery.params);
		return stmt.all();
	}
}

export class SQLiteDriver implements SyncDriver<SQLiteSession> {
	constructor(private client: Database, private dialect: SQLiteDialect<any>) {}

	connect(): SQLiteSession {
		return new SQLiteSessionDefault(this.client, this.dialect);
	}
}

export class SQLiteDialect<TDBSchema extends Record<string, AnySQLiteTable>>
	implements Dialect<SQLiteSession, SQLiteDatabase<TDBSchema>>
{
	constructor(private schema: TDBSchema) {}

	async migrate(migrations: MigrationMeta[], session: SQLiteSession): Promise<void> {
		// const migrations = sqliteTable('drizzle_migrations', {
		// 	id:
		// });

		const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)`;
		session.run(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
		session.run(migrationTableCreate);

		const dbMigrations = session.all(
			sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;
		session.run(sql`BEGIN`);

		try {
			for await (const migration of migrations) {
				if (!lastDbMigration || parseInt(lastDbMigration[2], 10)! < migration.folderMillis) {
					session.run(sql.raw(migration.sql));
					session.run(
						sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}

			session.run(sql`COMMIT`);
		} catch (e) {
			session.run(sql`ROLLBACK`);
			throw e;
		}
	}

	private buildTableNamesMap(): Record<string, string> {
		return Object.entries(this.schema).reduce<Record<string, string>>((acc, [tName, table]) => {
			acc[table[tableName]] = tName;
			return acc;
		}, {});
	}

	createDB(session: SQLiteSession): SQLiteDatabase<TDBSchema> {
		return this.createPGDB(session);
	}

	createPGDB(session: SQLiteSession): SQLiteDatabase<TDBSchema> {
		return Object.assign(
			Object.fromEntries(
				Object.entries(this.schema).map(([tableName, table]) => {
					return [
						tableName,
						new SQLiteTableOperations(table, session, this as unknown as AnySQLiteDialect, this.buildTableNamesMap()),
					];
				}),
			),
			{
				execute: (query: AnySQLiteSQL): any[] => {
					return session.allObjects(query);
				},
			},
		) as unknown as SQLiteDatabase<TDBSchema>;
	}

	public escapeName(name: string): string {
		return `"${name}"`;
	}

	public escapeParam(num: number): string {
		return `$${num}`;
	}

	public buildDeleteQuery<TTable extends AnySQLiteTable>({
		table,
		where,
		returning,
	}: SQLiteDeleteConfig<TTable>): AnySQLiteSQL<GetTableName<TTable>> {
		const returningSql = returning
			? sql.fromList([sql` returning `, ...this.prepareTableFieldsForQuery(returning, { isSingleTable: true })])
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${whereSql}${returningSql}` as AnySQLiteSQL<
			GetTableName<TTable>
		>;
	}

	buildUpdateSet<TTableName extends TableName>(
		table: AnySQLiteTable,
		set: SQLiteUpdateSet<AnySQLiteTable>,
	): AnySQLiteSQL<TTableName> {
		const setEntries = Object.entries<ColumnData | AnySQLiteSQL<TTableName>>(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.map(([colName, value], i): AnySQLiteSQL<TTableName>[] => {
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
		fields: SQLiteSelectFields<TTableName>,
		resultTableName: string,
	): SQLiteSelectFieldsOrdered<TTableName> {
		return Object.entries(fields).map(([name, column]) => ({
			name,
			resultTableName,
			column,
		}));
	}

	public buildUpdateQuery<TTable extends AnySQLiteTable>({
		table,
		set,
		where,
		returning,
	}: SQLiteUpdateConfig<TTable>): AnySQL {
		const setSql = this.buildUpdateSet<GetTableName<TTable>>(table, set);

		const returningSql = returning
			? sql<GetTableName<TTable>>` returning ${
				sql.fromList(
					this.prepareTableFieldsForQuery(returning, { isSingleTable: true }),
				)
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`update ${table} set ${setSql}${whereSql}${returningSql}`;
	}

	private prepareTableFieldsForQuery<TTableName extends TableName>(
		columns: SQLiteSelectFieldsOrdered<TTableName>,
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQLSourceParam<TTableName>[] {
		const columnsLen = columns.length;

		return columns
			.map(({ column }, i) => {
				const chunk: SQLSourceParam<TTableName>[] = [];

				if (column instanceof SQLResponse) {
					if (isSingleTable) {
						chunk.push(
							new SQL(column.sql.queryChunks.map((c) => {
								if (c instanceof SQLiteColumn) {
									return new Name(c.name);
								}
								return c;
							})),
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

	public buildSelectQuery<TTableName extends TableName>({
		fields,
		where,
		table: _table,
		joins,
		orderBy,
		limit,
		offset,
	}: SQLiteSelectConfig): AnySQLiteSQL<TTableName> {
		const table = _table as AnySQLiteTable<TTableName>;

		const joinKeys = Object.keys(joins);

		const fieldsSql = sql.fromList(
			this.prepareTableFieldsForQuery(fields, { isSingleTable: joinKeys.length === 0 }),
		);

		const joinsArray: AnySQLiteSQL[] = [];

		joinKeys.forEach((tableAlias, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const joinMeta = joins[tableAlias]!;
			const alias = joinMeta.aliasTable[tableName] === joinMeta.table[tableName] ? undefined : joinMeta.aliasTable;
			joinsArray.push(
				sql`${sql.raw(joinMeta.joinType)} join ${joinMeta.table} ${alias} on ${joinMeta.on}` as AnySQLiteSQL,
			);
			if (index < joinKeys.length - 1) {
				joinsArray.push(sql` `);
			}
		});

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderByList: AnySQLiteSQL[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql<TTableName>`select ${fieldsSql} from ${table}${joinsSql}${whereSql}${orderBySql}${limitSql}${offsetSql}`;
	}

	public buildInsertQuery({ table, values, onConflict, returning }: AnySQLiteInsertConfig): AnySQLiteSQL {
		const joinedValues: (SQLSourceParam<TableName> | AnySQLiteSQL)[][] = [];
		const columns: Record<string, AnySQLiteColumn> = table[tableColumns];
		const columnKeys = Object.keys(columns);
		const insertOrder = Object.values(columns).map((column) => new Name(column.name));

		values.forEach((value) => {
			const valueList: (SQLSourceParam<TableName> | AnySQLiteSQL)[] = [];
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

		const returningSql = returning
			? sql` returning ${sql.fromList(this.prepareTableFieldsForQuery(returning, { isSingleTable: true }))}`
			: undefined;

		const valuesSql = joinedValues.length === 1 ? joinedValues[0] : joinedValues;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`insert into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}${returningSql}`;
	}

	public prepareSQL(sql: AnySQLiteSQL): SQLitePreparedQuery {
		return sql.toQuery<SQLiteColumnDriverDataType>({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export type AnySQLiteDialect = SQLiteDialect<Record<string, AnySQLiteTable>>;

export type BuildTableNamesMap<TSchema extends Record<string, AnySQLiteTable>> = {
	[Key in keyof TSchema & string as Unwrap<GetTableName<TSchema[Key]>>]: Key;
};

export type SQLiteDatabase<TSchema extends Record<string, AnySQLiteTable>> = Simplify<
	{
		[TTableName in keyof TSchema & string]: TSchema[TTableName] extends AnySQLiteTable<TableName>
			? SQLiteTableOperations<TSchema[TTableName], BuildTableNamesMap<TSchema>>
			: never;
	} & {
		execute<T>(query: AnySQLiteSQL): Promise<T>;
		executeRaw(query: AnySQLiteSQL): Promise<any[][]>;
	},
	{ deep: true }
>;

export class SQLiteConnector<TDBSchema extends Record<string, AnySQLiteTable>>
	implements Connector<SQLiteSession, SQLiteDatabase<TDBSchema>>
{
	dialect: Dialect<SQLiteSession, SQLiteDatabase<TDBSchema>>;
	driver: SyncDriver<SQLiteSession>;

	constructor(client: Database, dbSchema: TDBSchema) {
		const dialect = new SQLiteDialect(dbSchema);
		this.dialect = dialect;
		this.driver = new SQLiteDriver(client, dialect);
	}
}
