import { AnyColumn, Column } from '~/column';
import { MigrationMeta } from '~/migrator';
import { Name, param, Query, SQL, sql, SQLResponse, SQLSourceParam } from '~/sql';
import { AnySQLiteColumn, SQLiteColumn } from '~/sqlite-core/columns';
import { SQLiteDeleteConfig, SQLiteInsertConfig, SQLiteUpdateConfig } from '~/sqlite-core/query-builders';
import { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table';
import { Subquery, SubqueryConfig } from '~/subquery';
import { getTableName, Table } from '~/table';
import { UpdateSet } from '~/utils';
import { SelectFieldsOrdered, SQLiteSelectConfig } from './query-builders/select.types';
import { SQLiteSession } from './session';

export abstract class SQLiteDialect {
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

	buildUpdateSet(table: AnySQLiteTable, set: UpdateSet): SQL {
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
		fields: SelectFieldsOrdered,
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields
			.map(({ field }, i) => {
				const chunk: SQLSourceParam[] = [];

				if (field instanceof SQLResponse || field instanceof SQL) {
					const query = field instanceof SQLResponse ? field.sql : field;

					if (isSingleTable) {
						chunk.push(
							new SQL(
								query.queryChunks.map((c) => {
									if (c instanceof SQLiteColumn) {
										return new Name(c.name);
									}
									return c;
								}),
							),
						);
					} else {
						chunk.push(query);
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

	buildSelectQuery(
		{ fieldsList: fields, where, table, joins, orderBy, groupBy, limit, offset }: SQLiteSelectConfig,
	): SQL {
		fields.forEach((f) => {
			let tableName: string;
			if (
				f.field instanceof Column && f.field.table !== table && !((tableName = getTableName(f.field.table)) in joins)
			) {
				throw new Error(
					`Column "${f.field.name}" was selected, but its table "${tableName}" was not joined`,
				);
			}
		});

		const joinKeys = Object.keys(joins);
		const isSingleTable = joinKeys.length === 0;

		const tableSql = table instanceof Subquery
			? sql`(${table})${isSingleTable ? undefined : new Name(table[SubqueryConfig].alias)}`
			: table;

		const selection = this.buildSelection(fields, { isSingleTable });

		const joinsArray: SQL[] = [];

		joinKeys.forEach((tableAlias, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const joinMeta = joins[tableAlias]!;
			const table = joinMeta.table;

			if (table instanceof SQLiteTable) {
				const tableName = table[SQLiteTable.Symbol.Name];
				const tableSchema = table[SQLiteTable.Symbol.Schema];
				const origTableName = table[SQLiteTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : tableAlias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${new Name(tableSchema)}.` : undefined}${new Name(
						origTableName,
					)} ${alias && new Name(alias)} on ${joinMeta.on}`,
				);
			} else {
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join (${table[SubqueryConfig].sql}) ${new Name(
						tableAlias,
					)} on ${joinMeta.on}`,
				);
			}
			if (index < joinKeys.length - 1) {
				joinsArray.push(sql` `);
			}
		});

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderByList: (AnySQLiteColumn | SQL)[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		const groupByList: (SQL | AnyColumn)[] = [];
		groupBy.forEach((groupByValue, index) => {
			groupByList.push(groupByValue);

			if (index < groupBy.length - 1) {
				groupByList.push(sql`, `);
			}
		});

		const groupBySql = groupByList.length > 0 ? sql` group by ${sql.fromList(groupByList)}` : undefined;

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`select ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, values, onConflict, returning }: SQLiteInsertConfig): SQL {
		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLSourceParam | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnySQLiteColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, AnySQLiteColumn][] = isSingleValue
			? Object.keys(values[0]!).map((fieldName) => [fieldName, columns[fieldName]!])
			: Object.entries(columns);
		const insertOrder = colEntries.map(([, column]) => new Name(column.name));

		values.forEach((value, valueIndex) => {
			const valueList: (SQLSourceParam | SQL)[] = [];
			colEntries.forEach(([fieldName, col]) => {
				const colValue = value[fieldName];
				if (typeof colValue === 'undefined') {
					let defaultValue;
					if (col.default !== null && col.default !== undefined) {
						if (col.default instanceof SQL) {
							defaultValue = col.default;
						} else {
							defaultValue = param(col.default, col);
						}
					} else {
						defaultValue = sql`null`;
					}
					valueList.push(defaultValue);
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
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`insert into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}${returningSql}`;
	}

	sqlToQuery(sql: SQL): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		});
	}
}

export class SQLiteSyncDialect extends SQLiteDialect {
	migrate(migrations: MigrationMeta[], session: SQLiteSession<'sync'>): void {
		const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`;
		session.run(migrationTableCreate);

		const dbMigrations = session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;
		session.run(sql`BEGIN`);

		try {
			for (const migration of migrations) {
				if (!lastDbMigration || parseInt(lastDbMigration[2], 10)! < migration.folderMillis) {
					session.exec(migration.sql);
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
}

export class SQLiteAsyncDialect extends SQLiteDialect {
	async migrate(migrations: MigrationMeta[], session: SQLiteSession<'async'>): Promise<void> {
		const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`;
		await session.run(migrationTableCreate);

		const dbMigrations = await session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;
		await session.run(sql`BEGIN`);

		try {
			for (const migration of migrations) {
				if (!lastDbMigration || parseInt(lastDbMigration[2], 10)! < migration.folderMillis) {
					await session.run(sql.raw(migration.sql));
					await session.run(
						sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}

			await session.run(sql`COMMIT`);
		} catch (e) {
			await session.run(sql`ROLLBACK`);
			throw e;
		}
	}
}
