import type { AnyColumn } from '~/column';
import { Column } from '~/column';
import type { MigrationMeta } from '~/migrator';
import { name, Param, param, type Query, SQL, sql, type SQLChunk } from '~/sql';
import type { AnySQLiteColumn } from '~/sqlite-core/columns';
import type { SQLiteDeleteConfig, SQLiteInsertConfig, SQLiteUpdateConfig } from '~/sqlite-core/query-builders';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SQLiteTable } from '~/sqlite-core/table';
import { Subquery, SubqueryConfig } from '~/subquery';
import { getTableName, Table } from '~/table';
import { orderSelectedFields, type UpdateSet } from '~/utils';
import { ViewBaseConfig } from '~/view';
import type { SelectedFieldsOrdered, SQLiteSelectConfig } from './query-builders/select.types';
import type { SQLiteSession } from './session';
import { SQLiteViewBase } from './view';

export abstract class SQLiteDialect {
	escapeName(name: string): string {
		return `"${name}"`;
	}

	escapeParam(_num: number): string {
		return '?';
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
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
				.flatMap(([colName, value], i): SQL[] => {
					const col: AnySQLiteColumn = table[Table.Symbol.Columns][colName]!;
					const res = sql`${name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				}),
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
									if (c instanceof Column) {
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
					const tableName = field.table[Table.Symbol.Name];
					const columnName = field.name;
					if (isSingleTable) {
						chunk.push(name(columnName));
					} else {
						chunk.push(sql`${name(tableName)}.${name(columnName)}`);
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
		{ withList, fields, fieldsFlat, where, having, table, joins, orderBy, groupBy, limit, offset }: SQLiteSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<AnySQLiteColumn>(fields);
		for (const f of fieldsList) {
			if (
				f.field instanceof Column
				&& getTableName(f.field.table)
					!== (table instanceof Subquery
						? table[SubqueryConfig].alias
						: table instanceof SQLiteViewBase
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

			if (table instanceof SQLiteTable) {
				const tableName = table[SQLiteTable.Symbol.Name];
				const tableSchema = table[SQLiteTable.Symbol.Schema];
				const origTableName = table[SQLiteTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
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
		}

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderByList: (AnySQLiteColumn | SQL | SQL.Aliased)[] = [];
		for (const [index, orderByValue] of orderBy.entries()) {
			orderByList.push(orderByValue);

			if (index < orderBy.length - 1) {
				orderByList.push(sql`, `);
			}
		}

		const groupByList: (SQL | AnyColumn | SQL.Aliased)[] = [];
		for (const [index, groupByValue] of groupBy.entries()) {
			groupByList.push(groupByValue);

			if (index < groupBy.length - 1) {
				groupByList.push(sql`, `);
			}
		}

		const groupBySql = groupByList.length > 0 ? sql` group by ${sql.fromList(groupByList)}` : undefined;

		const orderBySql = orderByList.length > 0 ? sql` order by ${sql.fromList(orderByList)}` : undefined;

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${withSql}select ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, values, onConflict, returning }: SQLiteInsertConfig): SQL {
		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnySQLiteColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, AnySQLiteColumn][] = isSingleValue
			? Object.keys(values[0]!).map((fieldName) => [fieldName, columns[fieldName]!])
			: Object.entries(columns);
		const insertOrder = colEntries.map(([, column]) => name(column.name));

		for (const [valueIndex, value] of values.entries()) {
			const valueList: (SQLChunk | SQL)[] = [];
			for (const [fieldName, col] of colEntries) {
				const colValue = value[fieldName];
				if (colValue === undefined || (colValue instanceof Param && colValue.value === undefined)) {
					let defaultValue;
					if (col.default !== null && col.default !== undefined) {
						defaultValue = col.default instanceof SQL ? col.default : param(col.default, col);
					} else {
						defaultValue = sql`null`;
					}
					valueList.push(defaultValue);
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
			escapeString: this.escapeString,
		});
	}

	// 	buildRelationalQuery(
	// 		fullSchema: Record<string, unknown>,
	// 		schema: TablesRelationalConfig,
	// 		tableNamesMap: Record<string, string>,
	// 		table: AnySQLiteTable,
	// 		tableConfig: TableRelationalConfig,
	// 		config: true | DBQueryConfig<'many'>,
	// 		tableAlias: string,
	// 		relationColumns: AnyColumn[],
	// 		isRoot = false,
	// 	): BuildRelationalQueryResult {
	// 		if (config === true) {
	// 			const selectionEntries = Object.entries(tableConfig.columns);
	// 			const selection: BuildRelationalQueryResult['selection'] = selectionEntries.map(([key, value]) => ({
	// 				dbKey: value.name,
	// 				tsKey: key,
	// 				tableTsKey: undefined,
	// 				isJson: false,
	// 				selection: [],
	// 			}));

	// 			return {
	// 				sql: isRoot
	// 					? this.buildSelectQuery({
	// 						table,
	// 						fields: {},
	// 						fieldsFlat: selectionEntries.map(([, c]) => ({
	// 							path: [c.name],
	// 							field: c as AnySQLiteColumn,
	// 						})),
	// 						groupBy: [],
	// 						orderBy: [],
	// 						joins: [],
	// 						withList: [],
	// 					})
	// 					: sql`${table}`,
	// 				selection,
	// 			};
	// 		}

	// 		const selection: Record<string, AnySQLiteColumn | SQL | SQL.Aliased> = {};
	// 		let selectedColumns: string[] = [];
	// 		let selectedCustomFields: { key: string; value: SQL | SQL.Aliased }[] = [];
	// 		let selectedRelations: { key: string; value: true | DBQueryConfig }[] = [];

	// 		if (config.select) {
	// 			let isIncludeMode = false;

	// 			for (const [field, value] of Object.entries(config.select)) {
	// 				if (value === undefined) {
	// 					continue;
	// 				}

	// 				if (field in tableConfig.columns) {
	// 					if (!isIncludeMode && value === true) {
	// 						isIncludeMode = true;
	// 					}
	// 					selectedColumns.push(field);
	// 				} else {
	// 					selectedRelations.push({ key: field, value });
	// 				}
	// 			}

	// 			if (!isIncludeMode && selectedColumns.length > 0) {
	// 				selectedColumns = Object.entries(tableConfig.columns)
	// 					.filter(([key, value]) => value instanceof Column && !selectedColumns.includes(key))
	// 					.map(([field]) => field);
	// 			}
	// 		} else if (config.include) {
	// 			selectedRelations = Object.entries(config.include).map(([key, value]) => ({
	// 				key,
	// 				value: value as any,
	// 			}));
	// 		}

	// 		if (!config.select) {
	// 			selectedColumns = Object.keys(tableConfig.columns);
	// 		}

	// 		if (config.includeCustom) {
	// 			const includeCustom = config.includeCustom(tableConfig.columns, { sql });
	// 			selectedCustomFields = Object.entries(includeCustom).map(([key, value]) => ({
	// 				key,
	// 				value,
	// 			}));
	// 		}

	// 		for (const field of selectedColumns) {
	// 			const column = tableConfig.columns[field] as AnySQLiteColumn;
	// 			selection[field] = column;
	// 		}

	// 		for (const { key, value } of selectedCustomFields) {
	// 			selection[key] = value;
	// 		}

	// 		const builtRelations: { key: string; value: BuildRelationalQueryResult }[] = [];
	// 		const joins: JoinsValue[] = [];
	// 		const builtRelationFields: SelectedFieldsOrdered = [];

	// 		for (const { key: selectedRelationKey, value: selectedRelationValue } of selectedRelations) {
	// 			let relation: Relation | undefined;
	// 			for (const [relationKey, relationValue] of Object.entries(tableConfig.relations)) {
	// 				if (relationValue instanceof Relation && relationKey === selectedRelationKey) {
	// 					relation = relationValue;
	// 					break;
	// 				}
	// 			}

	// 			if (!relation) {
	// 				throw new Error(`Relation ${selectedRelationKey} not found`);
	// 			}

	// 			const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);

	// 			const relationAlias = `${tableAlias}_${selectedRelationKey}`;

	// 			const builtRelation = this.buildRelationalQuery(
	// 				fullSchema,
	// 				schema,
	// 				tableNamesMap,
	// 				fullSchema[relation.referencedTable[Table.Symbol.Name]] as AnySQLiteTable,
	// 				schema[relation.referencedTable[Table.Symbol.Name]]!,
	// 				selectedRelationValue,
	// 				relationAlias,
	// 				normalizedRelation.references,
	// 			);
	// 			builtRelations.push({ key: selectedRelationKey, value: builtRelation });

	// 			joins.push({
	// 				table: new Subquery(builtRelation.sql, {}, relationAlias),
	// 				alias: selectedRelationKey,
	// 				on: and(
	// 					...normalizedRelation.fields.map((field, i) =>
	// 						eq(
	// 							aliasedTableColumn(field, tableAlias),
	// 							aliasedTableColumn(normalizedRelation.references[i]!, relationAlias),
	// 						)
	// 					),
	// 				),
	// 				joinType: 'left',
	// 			});

	// 			let elseField = sql`json_array(${
	// 				sql.join(
	// 					builtRelation.selection.map(({ dbKey: key, isJson }) => {
	// 						const field = sql`${sql.identifier(relationAlias)}.${sql.identifier(key)}`;
	// 						return isJson ? sql`json(${field})` : field;
	// 					}),
	// 					sql`, `,
	// 				)
	// 			})`;
	// 			if (relation instanceof Many) {
	// 				elseField = sql`json_group_array(${elseField})`;
	// 			}

	// 			const field = sql`case when count(${
	// 				sql.join(normalizedRelation.references.map((c) => aliasedTableColumn(c, relationAlias)), sql.raw(' or '))
	// 			}) = 0 then ${relation instanceof One ? sql`null` : sql`'[]'`} else ${elseField} end as ${
	// 				sql.identifier(selectedRelationKey)
	// 			}`;

	// 			builtRelationFields.push({
	// 				path: [selectedRelationKey],
	// 				field: field,
	// 			});
	// 		}

	// 		const unselectedRelationColumns = [...relationColumns];

	// 		const flatSelection: SelectedFieldsOrdered = Object.entries(selection).map(([key, value]) => {
	// 			if (value instanceof Column) {
	// 				const valueIndex = unselectedRelationColumns.indexOf(value);
	// 				if (valueIndex !== -1) {
	// 					unselectedRelationColumns.splice(valueIndex, 1);
	// 				}
	// 				value = aliasedTableColumn(value, tableAlias);
	// 			}
	// 			return {
	// 				path: [key],
	// 				field: value,
	// 			};
	// 		});

	// 		const relationColumnsSelection: SelectedFieldsOrdered = unselectedRelationColumns.map((column) => ({
	// 			path: [column.name],
	// 			field: aliasedTableColumn(column, tableAlias) as AnySQLiteColumn,
	// 		}));

	// 		const aliasedFields = Object.fromEntries(
	// 			Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
	// 		);

	// 		let where = config.where?.(aliasedFields, operators) ?? undefined;

	// 		where = and(
	// 			where,
	// 			...selectedRelations.filter(({ key }) => {
	// 				const relation = config.include?.[key] ?? config.select?.[key];
	// 				return typeof relation === 'object' && relation.limit !== undefined;
	// 			}).map(({ key }) => {
	// 				const value = (config.include?.[key] ?? config.select?.[key]) as DBQueryConfig<'many'>;
	// 				return sql`${sql.identifier(`${tableAlias}_${key}`)}.${
	// 					sql.identifier('__drizzle_limit')
	// 				} <= ${value.limit} + 1`;
	// 			}),
	// 		);

	// 		const groupBy = (builtRelationFields.length
	// 			? (tableConfig.primaryKey.length ? tableConfig.primaryKey : Object.values(tableConfig.columns)).map((c) =>
	// 				aliasedTableColumn(c, tableAlias)
	// 			)
	// 			: []) as AnySQLiteColumn[];

	// 		let orderBy = config.orderBy?.(aliasedFields, orderByOperators) as ValueOrArray<AnySQLiteColumn | SQL> ?? [];
	// 		if (!Array.isArray(orderBy)) {
	// 			orderBy = [orderBy];
	// 		}

	// 		const fieldsFlat: SelectedFieldsOrdered = [
	// 			...flatSelection,
	// 			...relationColumnsSelection,
	// 			...builtRelationFields,
	// 		];

	// 		if (config.limit !== undefined) {
	// 			fieldsFlat.push({
	// 				path: ['__drizzle_limit'],
	// 				field: sql`row_number() over(partition by ${relationColumns.map((c) => aliasedTableColumn(c, tableAlias))})`
	// 					.as('__drizzle_limit'),
	// 			});
	// 		}

	// 		const result = this.buildSelectQuery({
	// 			table: aliasedTable(table, tableAlias),
	// 			fields: {},
	// 			fieldsFlat,
	// 			where,
	// 			groupBy,
	// 			orderBy,
	// 			joins,
	// 			withList: [],
	// 		});

	// 		return {
	// 			sql: result,
	// 			selection: [
	// 				...flatSelection.map(({ path }) => ({
	// 					dbKey: (tableConfig.columns[path[0]!] as AnyColumn).name,
	// 					tsKey: path[0]!,
	// 					tableTsKey: undefined,
	// 					isJson: false,
	// 					selection: [],
	// 				})),
	// 				...builtRelations.map(({ key, value }) => ({
	// 					dbKey: key,
	// 					tsKey: key,
	// 					tableTsKey: tableConfig.tsName,
	// 					isJson: true,
	// 					selection: value.selection,
	// 				})),
	// 			],
	// 		};
	// 	}
}

export interface BuildRelationalQueryResult {
	selection: {
		dbKey: string;
		tsKey: string;
		tableTsKey: string | undefined;
		isJson: boolean;
		selection: BuildRelationalQueryResult['selection'];
	}[];
	sql: SQL;
}

export class SQLiteSyncDialect extends SQLiteDialect {
	migrate(migrations: MigrationMeta[], session: SQLiteSession<'sync'>): void {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
		session.run(migrationTableCreate);

		const dbMigrations = session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;
		session.run(sql`BEGIN`);

		try {
			for (const migration of migrations) {
				if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
					for (const stmt of migration.sql) {
						session.run(sql.raw(stmt));
					}
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
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
		await session.run(migrationTableCreate);

		const dbMigrations = await session.values<[number, string, string]>(
			sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);

		const lastDbMigration = dbMigrations[0] ?? undefined;

		await session.transaction(async (tx) => {
			for (const migration of migrations) {
				if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
					for (const stmt of migration.sql) {
						await tx.run(sql.raw(stmt));
					}
					await tx.run(
						sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					);
				}
			}
		});
	}
}
