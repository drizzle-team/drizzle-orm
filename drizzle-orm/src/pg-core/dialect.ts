import { AnyColumn, Column } from '~/column';
import { MigrationMeta } from '~/migrator';
import {
	AnyPgColumn,
	PgColumn,
	PgDate,
	PgJson,
	PgJsonb,
	PgNumeric,
	PgTime,
	PgTimestamp,
	PgUUID,
} from '~/pg-core/columns';
import { PgDeleteConfig, PgInsertConfig, PgUpdateConfig } from '~/pg-core/query-builders';
import { PgSelectConfig, SelectFieldsOrdered } from '~/pg-core/query-builders/select.types';
import { AnyPgTable, PgTable } from '~/pg-core/table';
import { DriverValueEncoder, Name, Query, QueryTypingsValue, SQL, sql, SQLResponse, SQLSourceParam } from '~/sql';
import { getTableName, Table } from '~/table';
import { UpdateSet } from '~/utils';
import { PgSession } from './session';

export class PgDialect {
	async migrate(migrations: MigrationMeta[], session: PgSession): Promise<void> {
		const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)`;
		await session.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
		await session.execute(migrationTableCreate);

		const dbMigrations = await session.all<{ id: number; hash: string; created_at: string }>(
			sql`SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0];
		await session.execute(sql`BEGIN`);

		try {
			for await (const migration of migrations) {
				if (
					!lastDbMigration
					|| parseInt(lastDbMigration.created_at, 10) < migration.folderMillis
				) {
					await session.execute(sql.raw(migration.sql));
					await session.execute(
						sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}

			await session.execute(sql`COMMIT`);
		} catch (e) {
			await session.execute(sql`ROLLBACK`);
			throw e;
		}
	}

	escapeName(name: string): string {
		return `"${name}"`;
	}

	escapeParam(num: number): string {
		return `$${num + 1}`;
	}

	buildDeleteQuery({ table, where, returning }: PgDeleteConfig): SQL {
		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: AnyPgTable, set: UpdateSet): SQL {
		const setEntries = Object.entries(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.map(([colName, value], i): SQL[] => {
					const col: AnyPgColumn = table[Table.Symbol.Columns][colName]!;
					const res = sql`${new Name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				})
				.flat(1),
		);
	}

	buildUpdateQuery({ table, set, where, returning }: PgUpdateConfig): SQL {
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
									if (c instanceof PgColumn) {
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

	buildSelectQuery({ fields, where, table, joins, orderBy, groupBy, limit, offset }: PgSelectConfig): SQL {
		fields.forEach((f) => {
			let tableName: string;
			if (
				f.field instanceof Column && f.field.table !== table && !((tableName = getTableName(f.field.table)) in joins)
			) {
				throw new Error(
					`Column "${f.path.join('.')}" was selected, but its table "${tableName}" was not joined`,
				);
			}
		});

		const joinKeys = Object.keys(joins);

		const selection = this.buildSelection(fields, { isSingleTable: joinKeys.length === 0 });

		const joinsArray: SQL[] = [];

		joinKeys.forEach((tableAlias, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const joinMeta = joins[tableAlias]!;
			const table = joinMeta.table;
			const tableName = table[PgTable.Symbol.Name];
			const tableSchema = table[PgTable.Symbol.Schema];
			const origTableName = table[PgTable.Symbol.OriginalName];
			const alias = tableName === origTableName ? undefined : tableAlias;
			joinsArray.push(
				sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? new Name(tableSchema) : sql.raw('')}${
					sql.raw(tableSchema ? '.' : '')
				}${new Name(origTableName)} ${alias && new Name(alias)} on ${joinMeta.on}`,
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

		const groupByList: (SQL | AnyColumn)[] = [];
		groupBy.forEach((groupByValue, index) => {
			groupByList.push(groupByValue);

			if (index < groupBy.length - 1) {
				groupByList.push(sql`, `);
			}
		});

		const groupBySql = groupByList.length > 0 ? sql` group by ${sql.fromList(groupByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`select ${selection} from ${table}${joinsSql}${whereSql}${groupBySql}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, values, onConflict, returning }: PgInsertConfig): SQL {
		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLSourceParam | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnyPgColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, AnyPgColumn][] = isSingleValue
			? Object.keys(values[0]!).map((fieldName) => [fieldName, columns[fieldName]!])
			: Object.entries(columns);
		const insertOrder = colEntries.map(([, column]) => new Name(column.name));

		values.forEach((value, valueIndex) => {
			const valueList: (SQLSourceParam | SQL)[] = [];
			colEntries.forEach(([fieldName]) => {
				const colValue = value[fieldName];
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
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`insert into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}${returningSql}`;
	}

	prepareTyping(encoder: DriverValueEncoder<unknown, unknown>): QueryTypingsValue {
		if (
			encoder instanceof PgJsonb || encoder instanceof PgJson
		) {
			return 'json';
		} else if (encoder instanceof PgNumeric) {
			return 'decimal';
		} else if (encoder instanceof PgTime) {
			return 'time';
		} else if (encoder instanceof PgTimestamp) {
			return 'timestamp';
		} else if (encoder instanceof PgDate) {
			return 'date';
		} else if (encoder instanceof PgUUID) {
			return 'uuid';
		} else {
			return 'none';
		}
	}

	sqlToQuery(sql: SQL): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
		}, this.prepareTyping);
	}
}
