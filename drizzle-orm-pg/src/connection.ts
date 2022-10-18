import {
	Column,
	Logger,
	MigrationConfig,
	MigrationMeta,
	NoopLogger,
	param,
	readMigrationFiles,
	sql,
} from 'drizzle-orm';
import { Name, PreparedQuery, SQL, SQLResponse, SQLSourceParam } from 'drizzle-orm/sql';
import { GetTableName, tableColumns, tableNameSym, tableOriginalNameSym } from 'drizzle-orm/utils';
import { Client, Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';

import { AnyPgColumn, PgColumn } from './columns';
import { PGDatabase } from './db';
import { PgSelectFields, PgSelectFieldsOrdered } from './operations';
import { PgDeleteConfig, PgInsertConfig, PgSelectConfig, PgUpdateConfig, PgUpdateSet } from './queries';
import { PgTable } from './table';

export type PgColumnDriverDataType =
	| string
	| number
	| bigint
	| boolean
	| null
	| Record<string, unknown>
	| Date;

export type PgClient = Pool | PoolClient | Client;

export interface PgSession {
	query(query: string, params: unknown[]): Promise<QueryResult>;
	queryObjects<T extends QueryResultRow>(
		query: string,
		params: unknown[],
	): Promise<QueryResult<T>>;
}

export interface PgDefaultSessionOptions {
	logger?: Logger;
}

export class PgDefaultSession {
	private logger: Logger;

	constructor(private client: PgClient, options: PgDefaultSessionOptions = {}) {
		this.logger = options.logger ?? new NoopLogger();
	}

	public async query(query: string, params: unknown[]): Promise<QueryResult> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			rowMode: 'array',
			text: query,
			values: params,
		});
		return result;
	}

	public async queryObjects<T extends QueryResultRow>(
		query: string,
		params: unknown[],
	): Promise<QueryResult<T>> {
		return this.client.query<T>(query, params);
	}
}

export interface PgDriverOptions {
	logger?: Logger;
}

export class PgDriver {
	constructor(private client: PgClient, private options: PgDriverOptions = {}) {
		this.initMappers();
	}

	async connect(): Promise<PgSession> {
		return new PgDefaultSession(this.client, { logger: this.options.logger });
	}

	public initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export class PgDialect {
	async migrate(migrations: MigrationMeta[], session: PgSession): Promise<void> {
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

		const lastDbMigration = dbMigrations.rows[0] ?? undefined;
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

	createDB(session: PgSession): PGDatabase {
		return this.createPGDB(session);
	}

	createPGDB(session: PgSession): PGDatabase {
		return new PGDatabase(this, session);
		// return Object.assign(
		// 	Object.fromEntries(
		// 		Object.entries(this.schema).map(([tableName, table]) => {
		// 			return [
		// 				tableName,
		// 				new PgTableOperations(
		// 					table,
		// 					session,
		// 					this as unknown as AnyPgDialect,
		// 					this.buildTableNamesMap(),
		// 				),
		// 			];
		// 		}),
		// 	),
		// 	{
		// 		execute: (query: PgPreparedQuery | AnyPgSQL): Promise<QueryResult> => {
		// 			const preparedQuery = query instanceof SQL ? this.prepareSQL(query) : query;
		// 			return session.queryObjects(preparedQuery.sql, preparedQuery.params);
		// 		},
		// 	},
		// ) as unknown as PGDatabase<TDBSchema>;
	}

	public escapeName(name: string): string {
		return `"${name}"`;
	}

	public escapeParam(num: number): string {
		return `$${num}`;
	}

	public buildDeleteQuery({ table, where, returning }: PgDeleteConfig): SQL {
		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: PgTable, set: PgUpdateSet<PgTable>): SQL {
		const setEntries = Object.entries<unknown | SQL>(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.map(([colName, value], i): SQL[] => {
					const col: AnyPgColumn = table[tableColumns][colName]!;
					const mappedValue = value instanceof SQL || value === null ? value : param(value, col);
					const res = sql`${new Name(col.name)} = ${mappedValue}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				})
				.flat(1),
		);
	}

	orderSelectedFields(
		fields: PgSelectFields<string>,
		resultTableName: string,
	): PgSelectFieldsOrdered {
		return Object.entries(fields).map(([name, field]) => ({ name, resultTableName, field }));
	}

	public buildUpdateQuery<TTable extends PgTable>({ table, set, where, returning }: PgUpdateConfig<TTable>): SQL {
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
		fields: PgSelectFieldsOrdered,
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
									if (c instanceof PgColumn) {
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

	public buildSelectQuery({
		fields,
		where,
		table,
		joins,
		orderBy,
		limit,
		offset,
	}: PgSelectConfig): SQL {
		const joinKeys = Object.keys(joins);

		const selection = this.buildSelection(fields, { isSingleTable: joinKeys.length === 0 });

		const joinsArray: SQL[] = [];

		joinKeys.forEach((tableAlias, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const joinMeta = joins[tableAlias]!;
			const table = joinMeta.table;
			const alias = table[tableNameSym] === table[tableOriginalNameSym] ? undefined : tableAlias;
			joinsArray.push(
				sql`${sql.raw(joinMeta.joinType)} join ${joinMeta.table} ${alias} on ${joinMeta.on}`,
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

	public buildInsertQuery({ table, values, onConflict, returning }: PgInsertConfig): SQL {
		const valuesSqlList: ((SQLSourceParam | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnyPgColumn> = table[tableColumns];
		const columnKeys = Object.keys(columns);
		const insertOrder = Object.values(columns).map((column) => new Name(column.name));

		values.forEach((value, valueIndex) => {
			const valueList: (SQLSourceParam | SQL)[] = [];
			columnKeys.forEach((colKey) => {
				const colValue = value[colKey];
				const column = columns[colKey]!;
				if (typeof colValue === 'undefined') {
					valueList.push(sql`default`);
				} else if (colValue instanceof SQL || colValue === null) {
					valueList.push(colValue);
				} else {
					valueList.push(param(colValue, column));
				}
			});
			valuesSqlList.push(valueList);
			if (valueIndex < values.length - 1) {
				valuesSqlList.push(sql`, `);
			}
		});

		const valuesSql = sql.fromList(valuesSqlList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`insert into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}${returningSql}`;
	}

	public prepareSQL(sql: SQL): PreparedQuery {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export interface PgConnectorOptions {
	logger?: Logger;
	dialect?: PgDialect;
	driver?: PgDriver;
}

export class PgConnector {
	dialect: PgDialect;
	driver: PgDriver;
	private session: PgSession | undefined;

	constructor(client: PgClient, options: PgConnectorOptions = {}) {
		this.dialect = new PgDialect();
		this.driver = new PgDriver(client, { logger: options.logger });
	}

	private async getSession() {
		return this.session ?? (this.session = await this.driver.connect());
	}

	async connect() {
		const session = await this.getSession();
		return this.dialect.createDB(session);
	}

	async migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = await this.getSession();
		await this.dialect.migrate(migrations, session);
	}
}
