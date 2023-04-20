import type { AnyColumn } from '~/column';
import { Column } from '~/column';
import type { MigrationConfig, MigrationMeta } from '~/migrator';
import { name, Param, type Query, SQL, sql, type SQLChunk } from '~/sql';
import { Subquery, SubqueryConfig } from '~/subquery';
import { getTableName, Table } from '~/table';
import { orderSelectedFields, type UpdateSet } from '~/utils';
import { View, ViewBaseConfig } from '~/view';
import type { AnyMySqlColumn } from './columns/common';
import { MySqlColumn } from './columns/common';
import type { MySqlDeleteConfig } from './query-builders/delete';
import type { MySqlInsertConfig } from './query-builders/insert';
import type { MySqlSelectConfig, SelectedFieldsOrdered } from './query-builders/select.types';
import type { MySqlUpdateConfig } from './query-builders/update';
import type { MySqlSession } from './session';
import type { AnyMySqlTable } from './table';
import { MySqlTable } from './table';
import { MySqlViewBase } from './view';

// TODO find out how to use all/values. Seems like I need those functions
// Build project
// copy runtime tests to be sure it's working

// Add mysql to drizzle-kit

// Add Planetscale Driver and create example repo

export class MySqlDialect {
	async migrate(migrations: MigrationMeta[], session: MySqlSession, config: MigrationConfig): Promise<void> {
		const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
		const migrationTableCreate = sql`
			create table if not exists ${name(migrationsTable)} (
				id serial primary key,
				hash text not null,
				created_at bigint
			)
		`;
		await session.execute(migrationTableCreate);

		const dbMigrations = await session.all<{ id: number; hash: string; created_at: string }>(
			sql`select id, hash, created_at from ${name(migrationsTable)} order by created_at desc limit 1`,
		);

		const lastDbMigration = dbMigrations[0];

		await session.transaction(async (tx) => {
			for (const migration of migrations) {
				if (
					!lastDbMigration
					|| Number(lastDbMigration.created_at) < migration.folderMillis
				) {
					for (const stmt of migration.sql) {
						await tx.execute(sql.raw(stmt));
					}
					await tx.execute(
						sql`insert into ${
							name(migrationsTable)
						} (\`hash\`, \`created_at\`) values(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}
		});
	}

	escapeName(name: string): string {
		return `\`${name}\``;
	}

	escapeParam(_num: number): string {
		return `?`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
	}

	buildDeleteQuery({ table, where, returning }: MySqlDeleteConfig): SQL {
		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: AnyMySqlTable, set: UpdateSet): SQL {
		const setEntries = Object.entries(set);

		const setSize = setEntries.length;
		return sql.fromList(
			setEntries
				.flatMap(([colName, value], i): SQL[] => {
					const col: AnyMySqlColumn = table[Table.Symbol.Columns][colName]!;
					const res = sql`${name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				}),
		);
	}

	buildUpdateQuery({ table, set, where, returning }: MySqlUpdateConfig): SQL {
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
			.flatMap(({ field }, i) => {
				const chunk: SQLChunk[] = [];

				if (field instanceof SQL.Aliased && field.isSelectionField) {
					chunk.push(name(field.fieldAlias));
				} else if (field instanceof SQL.Aliased || field instanceof SQL) {
					const query = field instanceof SQL.Aliased ? field.sql : field;

					if (isSingleTable) {
						chunk.push(
							new SQL(
								query.queryChunks.map((c) => {
									if (c instanceof MySqlColumn) {
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
			});

		return sql.fromList(chunks);
	}

	buildSelectQuery(
		{ withList, fields, where, having, table, joins, orderBy, groupBy, limit, offset, lockingClause }:
			MySqlSelectConfig,
	): SQL {
		const fieldsList = orderSelectedFields<AnyMySqlColumn>(fields);
		for (const f of fieldsList) {
			if (
				f.field instanceof Column
				&& getTableName(f.field.table)
					!== (table instanceof Subquery
						? table[SubqueryConfig].alias
						: table instanceof MySqlViewBase
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
		}

		const isSingleTable = joins.length === 0;

		let withSql: SQL | undefined;
		if (withList.length) {
			const withSqlChunks = [sql`with `];
			for (const [i, w] of withList.entries()) {
				withSqlChunks.push(sql`${name(w[SubqueryConfig].alias)} as (${w[SubqueryConfig].sql})`);
				if (i < withList.length - 1) {
					withSqlChunks.push(sql`, `);
				}
			}
			withSqlChunks.push(sql` `);
			withSql = sql.fromList(withSqlChunks);
		}

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = (() => {
			if (table instanceof Table && table[Table.Symbol.OriginalName] !== table[Table.Symbol.Name]) {
				return sql`${name(table[Table.Symbol.OriginalName])} ${name(table[Table.Symbol.Name])}`;
			}

			return table;
		})();

		const joinsArray: SQL[] = [];

		for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const table = joinMeta.table;

			if (table instanceof MySqlTable) {
				const tableName = table[MySqlTable.Symbol.Name];
				const tableSchema = table[MySqlTable.Symbol.Schema];
				const origTableName = table[MySqlTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${name(tableSchema)}.` : undefined}${
						name(origTableName)
					}${alias && sql` ${name(alias)}`} on ${joinMeta.on}`,
				);
			} else if (table instanceof View) {
				const viewName = table[ViewBaseConfig].name;
				const viewSchema = table[ViewBaseConfig].schema;
				const origViewName = table[ViewBaseConfig].originalName;
				const alias = viewName === origViewName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${viewSchema ? sql`${name(viewSchema)}.` : undefined}${
						name(origViewName)
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
		}

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderByList: (AnyMySqlColumn | SQL | SQL.Aliased)[] = [];
		for (const [index, orderByValue] of orderBy.entries()) {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		}

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const groupByList: (SQL | AnyColumn | SQL.Aliased)[] = [];
		for (const [index, groupByValue] of groupBy.entries()) {
			groupByList.push(groupByValue);

			if (index < groupBy.length - 1) {
				groupByList.push(sql`, `);
			}
		}

		const groupBySql = groupByList.length > 0 ? sql` group by ${sql.fromList(groupByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		let lockingClausesSql;
		if (lockingClause) {
			const { config, strength } = lockingClause;
			lockingClausesSql = sql` for ${sql.raw(strength)}`;
			if (config.noWait) {
				lockingClausesSql.append(sql` no wait`);
			} else if (config.skipLocked) {
				lockingClausesSql.append(sql` skip locked`);
			}
		}

		return sql`${withSql}select ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}`;
	}

	buildInsertQuery({ table, values, ignore, onConflict }: MySqlInsertConfig): SQL {
		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnyMySqlColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, AnyMySqlColumn][] = isSingleValue
			? Object.keys(values[0]!).map((fieldName) => [fieldName, columns[fieldName]!])
			: Object.entries(columns);
		const insertOrder = colEntries.map(([, column]) => name(column.name));

		for (const [valueIndex, value] of values.entries()) {
			const valueList: (SQLChunk | SQL)[] = [];
			for (const [fieldName] of colEntries) {
				const colValue = value[fieldName];
				if (colValue === undefined || (colValue instanceof Param && colValue.value === undefined)) {
					valueList.push(sql`default`);
				} else {
					valueList.push(colValue);
				}
			}
			valuesSqlList.push(valueList);
			if (valueIndex < values.length - 1) {
				valuesSqlList.push(sql`, `);
			}
		}

		const valuesSql = sql.fromList(valuesSqlList);

		const ignoreSql = ignore ? sql` ignore` : undefined;

		const onConflictSql = onConflict ? sql` on duplicate key ${onConflict}` : undefined;

		return sql`insert${ignoreSql} into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}`;
	}

	sqlToQuery(sql: SQL): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
		});
	}
}
