import { Database, RunResult } from 'better-sqlite3';
import {
	Column,
	Logger,
	MigrationConfig,
	MigrationMeta,
	NoopLogger,
	readMigrationFiles,
	sql,
	Table,
} from 'drizzle-orm';
import { Name, Param, PreparedQuery, SQL, SQLResponse, SQLSourceParam } from 'drizzle-orm/sql';

import { AnySQLiteColumn, SQLiteColumn } from './columns';
import { SQLiteDatabase } from './db';
import { SQLiteSelectFields, SQLiteSelectFieldsOrdered } from './operations';
import {
	SQLiteDeleteConfig,
	SQLiteInsertConfig,
	SQLiteSelectConfig,
	SQLiteUpdateConfig,
	SQLiteUpdateSet,
} from './queries';
import { AnySQLiteTable, SQLiteTable } from './table';

export type SQLiteColumnDriverDataType = null | number | bigint | string | Buffer;

export interface SQLiteSession {
	run(query: SQL): RunResult;
	get<T extends any[] = unknown[]>(query: SQL): T;
	getObject<T = unknown>(query: SQL): T;
	all<T extends any[] = unknown[]>(query: SQL): T[];
	allObjects<T = unknown>(query: SQL): T[];
}

export interface SQLiteDefaultSessionOptions {
	logger?: Logger;
}

export class SQLiteDefaultSession implements SQLiteSession {
	private logger: Logger;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		options: SQLiteDefaultSessionOptions = {},
	) {
		this.logger = options.logger ?? new NoopLogger();
	}

	run(query: SQL): RunResult {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		return stmt.run(...preparedQuery.params);
	}

	get<T extends any[] = unknown[]>(query: SQL): T {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		stmt.raw();
		return stmt.get(...preparedQuery.params);
	}

	getObject<T = unknown>(query: SQL): T {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		return stmt.get(...preparedQuery.params);
	}

	all<T extends any[] = unknown[]>(query: SQL): T[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		stmt.raw();
		return stmt.all(...preparedQuery.params);
	}

	allObjects<T = unknown>(query: SQL): T[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		return stmt.all(...preparedQuery.params);
	}
}

export interface SQLiteDriverOptions {
	logger?: Logger;
}

export class SQLiteDriver {
	constructor(private client: Database, private dialect: SQLiteDialect, private options: SQLiteDriverOptions = {}) {}

	connect(): SQLiteSession {
		return new SQLiteDefaultSession(this.client, this.dialect, { logger: this.options.logger });
	}
}

export class SQLiteDialect {
	migrate(migrations: MigrationMeta[], session: SQLiteSession): void {
		// const migrations = sqliteTable('drizzle_migrations', {
		// 	id:
		// });

		const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`;
		session.run(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
		session.run(migrationTableCreate);

		const dbMigrations = session.all<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;
		session.run(sql`BEGIN`);

		try {
			for (const migration of migrations) {
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

	createDB(session: SQLiteSession): SQLiteDatabase {
		return new SQLiteDatabase(this, session);
	}

	escapeName(name: string): string {
		return `"${name}"`;
	}

	escapeParam(num: number): string {
		return '?';
	}

	buildDeleteQuery({ table, where, returning }: SQLiteDeleteConfig): SQL {
		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: AnySQLiteTable, set: SQLiteUpdateSet): SQL {
		const setEntries = Object.entries(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.map(([colName, value], i): SQL[] => {
					const col: AnySQLiteColumn = table[Table.Symbol.Columns][colName]!;
					const res = sql`${new Name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				})
				.flat(1),
		);
	}

	orderSelectedFields(fields: SQLiteSelectFields<string>, resultTableName: string): SQLiteSelectFieldsOrdered {
		return Object.entries(fields).map(([name, field]) => ({ name, resultTableName, field }));
	}

	buildUpdateQuery({ table, set, where, returning }: SQLiteUpdateConfig): SQL {
		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`update ${table} set ${setSql}${whereSql}${returningSql}`;
	}

	/**
	 * Builds selection SQL with provided fields/expressions
	 *
	 * Examples:
	 *
	 * `select <selection> from`
	 *
	 * `insert ... returning <selection>`
	 *
	 * If `isSingleTable` is true, then columns won't be prefixed with table name
	 */
	private buildSelection(
		fields: SQLiteSelectFieldsOrdered,
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields
			.map(({ field }, i) => {
				const chunk: SQLSourceParam[] = [];

				if (field instanceof SQLResponse) {
					if (isSingleTable) {
						chunk.push(
							new SQL(
								field.sql.queryChunks.map((c) => {
									if (c instanceof SQLiteColumn) {
										return new Name(c.name);
									}
									return c;
								}),
							),
						);
					} else {
						chunk.push(field.sql);
					}
				} else if (field instanceof Column) {
					if (isSingleTable) {
						chunk.push(new Name(field.name));
					} else {
						chunk.push(field);
					}
				}

				if (i < columnsLen - 1) {
					chunk.push(sql`, `);
				}

				return chunk;
			})
			.flat(1);

		return sql.fromList(chunks);
	}

	buildSelectQuery({ fields, where, table, joins, orderBy, limit, offset }: SQLiteSelectConfig): SQL {
		const joinKeys = Object.keys(joins);

		const selection = this.buildSelection(fields, { isSingleTable: joinKeys.length === 0 });

		const joinsArray: SQL[] = [];

		joinKeys.forEach((tableAlias, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const joinMeta = joins[tableAlias]!;
			const table = joinMeta.table;
			const tableName = table[Table.Symbol.Name];
			const origTableName = table[SQLiteTable.Symbol.OriginalName];
			const alias = tableName === origTableName ? undefined : tableAlias;
			joinsArray.push(
				sql`${sql.raw(joinMeta.joinType)} join ${new Name(origTableName)} ${
					alias && new Name(alias)
				} on ${joinMeta.on}`,
			);
			if (index < joinKeys.length - 1) {
				joinsArray.push(sql` `);
			}
		});

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderByList: SQL[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`select ${selection} from ${table}${joinsSql}${whereSql}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, value, onConflict, returning }: SQLiteInsertConfig): SQL {
		const columns = table[SQLiteTable.Symbol.Columns];

		const insertOrder: Name[] = [];
		const valuesSqlList: (Param | SQL)[] = [];
		const entries = Object.entries(value);
		const colsCount = entries.length;
		entries.forEach(([key, val], i) => {
			const column = columns[key]!;

			insertOrder.push(new Name(column.name));
			valuesSqlList.push(val);

			if (i < colsCount - 1) {
				valuesSqlList.push(sql`, `);
			}
		});

		const valuesSql = sql.fromList(valuesSqlList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`insert into ${table} ${insertOrder} values (${valuesSql}${onConflictSql}${returningSql})`;
	}

	prepareSQL(sql: SQL): PreparedQuery {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export interface SQLiteConnectorOptions {
	logger?: Logger;
	dialect?: SQLiteDialect;
	driver?: SQLiteDriver;
}

export class SQLiteConnector {
	dialect: SQLiteDialect;
	driver: SQLiteDriver;
	private session: SQLiteSession | undefined;

	constructor(client: Database, options: SQLiteConnectorOptions = {}) {
		this.dialect = new SQLiteDialect();
		this.driver = new SQLiteDriver(client, this.dialect, { logger: options.logger });
	}

	private getSession() {
		return this.session ?? (this.session = this.driver.connect());
	}

	connect() {
		const session = this.getSession();
		return this.dialect.createDB(session);
	}

	migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = this.getSession();
		this.dialect.migrate(migrations, session);
	}
}
