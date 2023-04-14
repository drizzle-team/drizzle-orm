import type { AnyColumn } from '~/column';
import { Column } from '~/column';
import type { MigrationMeta } from '~/migrator';
import type { AnyPgColumn } from '~/pg-core/columns';
import { PgColumn, PgDate, PgJson, PgJsonb, PgNumeric, PgTime, PgTimestamp, PgUUID } from '~/pg-core/columns';
import type { PgDeleteConfig, PgInsertConfig, PgUpdateConfig } from '~/pg-core/query-builders';
import type { PgSelectConfig, SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { AnyPgTable } from '~/pg-core/table';
import { PgTable } from '~/pg-core/table';
import { type DriverValueEncoder, name, type Query, type QueryTypingsValue, SQL, sql, type SQLChunk } from '~/sql';
import { Subquery, SubqueryConfig } from '~/subquery';
import { getTableName, Table } from '~/table';
import { orderSelectedFields, type UpdateSet } from '~/utils';
import { ViewBaseConfig } from '~/view';
import type { PgSession } from './session';
import { type PgMaterializedView, PgViewBase } from './view';

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
			sql`select id, hash, created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1`,
		);

		const lastDbMigration = dbMigrations[0];
		await session.transaction(async (tx) => {
			for await (const migration of migrations) {
				if (
					!lastDbMigration
					|| parseInt(lastDbMigration.created_at, 10) < migration.folderMillis
				) {
					for (const stmt of migration.sql) {
						await tx.execute(sql.raw(stmt));
					}
					await tx.execute(
						sql`insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}
		});
	}

	escapeName(name: string): string {
		return `"${name}"`;
	}

	escapeParam(num: number): string {
		return `$${num + 1}`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
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
					const res = sql`${name(col.name)} = ${value}`;
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
		fields: SelectedFieldsOrdered,
		{ isSingleTable = false }: { isSingleTable?: boolean } = {},
	): SQL {
		const columnsLen = fields.length;

		const chunks = fields
			.map(({ field }, i) => {
				const chunk: SQLChunk[] = [];

				if (field instanceof SQL.Aliased && field.isSelectionField) {
					chunk.push(name(field.fieldAlias));
				} else if (field instanceof SQL.Aliased || field instanceof SQL) {
					const query = field instanceof SQL.Aliased ? field.sql : field;

					if (isSingleTable) {
						chunk.push(
							new SQL(
								query.queryChunks.map((c) => {
									if (c instanceof PgColumn) {
										return name(c.name);
									}
									return c;
								}),
							),
						);
					} else {
						chunk.push(query);
					}

					if (field instanceof SQL.Aliased) {
						chunk.push(sql` as ${name(field.fieldAlias)}`);
					}
				} else if (field instanceof Column) {
					if (isSingleTable) {
						chunk.push(name(field.name));
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
		{ withList, fields, where, having, table, joins, orderBy, groupBy, limit, offset, lockingClauses }: PgSelectConfig,
	): SQL {
		const fieldsList = orderSelectedFields<AnyPgColumn>(fields);
		fieldsList.forEach((f) => {
			if (
				f.field instanceof Column
				&& getTableName(f.field.table)
					!== (table instanceof Subquery
						? table[SubqueryConfig].alias
						: table instanceof PgViewBase
						? table[ViewBaseConfig].name
						: table instanceof SQL
						? undefined
						: getTableName(table))
				&& !((table) => joins.some(({ alias }) => alias === getTableName(table)))(f.field.table)
			) {
				const tableName = getTableName(f.field.table);
				throw new Error(
					`Your "${
						f.path.join('->')
					}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`,
				);
			}
		});

		const isSingleTable = joins.length === 0;

		let withSql: SQL | undefined;
		if (withList.length) {
			const withSqlChunks = [sql`with `];
			withList.forEach((w, i) => {
				withSqlChunks.push(sql`${name(w[SubqueryConfig].alias)} as (${w[SubqueryConfig].sql})`);
				if (i < withList.length - 1) {
					withSqlChunks.push(sql`, `);
				}
			});
			withSqlChunks.push(sql` `);
			withSql = sql.fromList(withSqlChunks);
		}

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const joinsArray: SQL[] = [];

		joins.forEach((joinMeta, index) => {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const table = joinMeta.table;

			if (table instanceof PgTable) {
				const tableName = table[PgTable.Symbol.Name];
				const tableSchema = table[PgTable.Symbol.Schema];
				const origTableName = table[PgTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${name(tableSchema)}.` : undefined}${
						name(origTableName)
					}${alias && sql` ${name(alias)}`} on ${joinMeta.on}`,
				);
			} else {
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${table} on ${joinMeta.on}`,
				);
			}
			if (index < joins.length - 1) {
				joinsArray.push(sql` `);
			}
		});

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderByList: (AnyPgColumn | SQL | SQL.Aliased)[] = [];
		orderBy.forEach((orderByValue, index) => {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		});

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const groupByList: (SQL | AnyColumn | SQL.Aliased)[] = [];
		groupBy.forEach((groupByValue, index) => {
			groupByList.push(groupByValue);

			if (index < groupBy.length - 1) {
				groupByList.push(sql`, `);
			}
		});

		const groupBySql = groupByList.length > 0 ? sql` group by ${sql.fromList(groupByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		let lockingClausesSql = sql.empty();
		lockingClauses.forEach(({ strength, config }) => {
			let clauseSql = sql` for ${sql.raw(strength)}`;
			if (config.of) {
				clauseSql.append(sql` of ${config.of}`);
			}
			if (config.noWait) {
				clauseSql.append(sql` no wait`);
			} else if (config.skipLocked) {
				clauseSql.append(sql` skip locked`);
			}
			lockingClausesSql.append(clauseSql);
		});

		return sql`${withSql}select ${selection} from ${table}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}`;
	}

	buildInsertQuery({ table, values, onConflict, returning }: PgInsertConfig): SQL {
		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnyPgColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, AnyPgColumn][] = isSingleValue
			? Object.keys(values[0]!).map((fieldName) => [fieldName, columns[fieldName]!])
			: Object.entries(columns);
		const insertOrder = colEntries.map(([, column]) => name(column.name));

		values.forEach((value, valueIndex) => {
			const valueList: (SQLChunk | SQL)[] = [];
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

	buildRefreshMaterializedViewQuery(
		{ view, concurrently, withNoData }: { view: PgMaterializedView; concurrently?: boolean; withNoData?: boolean },
	): SQL {
		const concurrentlySql = concurrently ? sql` concurrently` : undefined;
		const withNoDataSql = withNoData ? sql` with no data` : undefined;

		return sql`refresh materialized view${concurrentlySql} ${view}${withNoDataSql}`;
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
			escapeString: this.escapeString,
			prepareTyping: this.prepareTyping,
		});
	}
}
