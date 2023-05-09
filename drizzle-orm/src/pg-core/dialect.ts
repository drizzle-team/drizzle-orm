import { aliasedRelation, aliasedTable, aliasedTableColumn } from '~/alias';
import type { AnyColumn } from '~/column';
import { Column } from '~/column';
import type { MigrationMeta } from '~/migrator';
import type { AnyPgColumn } from '~/pg-core/columns';
import { PgColumn, PgDate, PgJson, PgJsonb, PgNumeric, PgTime, PgTimestamp, PgUUID } from '~/pg-core/columns';
import type { PgDeleteConfig, PgInsertConfig, PgUpdateConfig } from '~/pg-core/query-builders';
import type { JoinsValue, PgSelectConfig, SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { AnyPgTable } from '~/pg-core/table';
import { PgTable } from '~/pg-core/table';
import {
	type BuildRelationalQueryResult,
	type DBQueryConfig,
	normalizeRelation,
	One,
	operators,
	orderByOperators,
	Relation,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations';
import {
	and,
	type DriverValueEncoder,
	eq,
	name,
	or,
	Param,
	type Query,
	type QueryTypingsValue,
	SQL,
	sql,
	type SQLChunk,
} from '~/sql';
import { Subquery, SubqueryConfig } from '~/subquery';
import { getTableName, Table } from '~/table';
import { orderSelectedFields, type UpdateSet, type ValueOrArray } from '~/utils';
import { ViewBaseConfig } from '~/view';
import type { PgSession } from './session';
import { type PgMaterializedView, PgViewBase } from './view';

export class PgDialect {
	async migrate(migrations: MigrationMeta[], session: PgSession): Promise<void> {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)
		`;
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
					|| Number(lastDbMigration.created_at) < migration.folderMillis
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
				.flatMap(([colName, value], i): SQL[] => {
					const col: AnyPgColumn = table[Table.Symbol.Columns][colName]!;
					const res = sql`${name(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				}),
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
			});

		return sql.fromList(chunks);
	}

	buildSelectQuery(
		{ withList, fields, fieldsFlat, where, having, table, joins, orderBy, groupBy, limit, offset, lockingClauses }:
			PgSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<AnyPgColumn>(fields);
		for (const f of fieldsList) {
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
				let fullName = sql`${sql.identifier(table[Table.Symbol.OriginalName])}`;
				if (table[Table.Symbol.Schema]) {
					fullName = sql`${sql.identifier(table[Table.Symbol.Schema]!)}.${fullName}`;
				}
				return sql`${fullName} ${sql.identifier(table[Table.Symbol.Name])}`;
			}

			return table;
		})();

		const joinsArray: SQL[] = [];

		for (const [index, joinMeta] of joins.entries()) {
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
		}

		const joinsSql = sql.fromList(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderByList: (AnyPgColumn | SQL | SQL.Aliased)[] = [];
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

		const lockingClausesSql = sql.empty();
		for (const { strength, config } of lockingClauses) {
			const clauseSql = sql` for ${sql.raw(strength)}`;
			if (config.of) {
				clauseSql.append(sql` of ${config.of}`);
			}
			if (config.noWait) {
				clauseSql.append(sql` no wait`);
			} else if (config.skipLocked) {
				clauseSql.append(sql` skip locked`);
			}
			lockingClausesSql.append(clauseSql);
		}

		return sql`${withSql}select ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}`;
	}

	buildInsertQuery({ table, values, onConflict, returning }: PgInsertConfig): SQL {
		const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, AnyPgColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, AnyPgColumn][] = isSingleValue
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

	buildRelationalQuery(
		fullSchema: Record<string, unknown>,
		schema: TablesRelationalConfig,
		tableNamesMap: Record<string, string>,
		table: AnyPgTable,
		tableConfig: TableRelationalConfig,
		config: true | DBQueryConfig<'many'>,
		tableAlias: string,
		relationColumns: AnyColumn[],
		isRoot = false,
	): BuildRelationalQueryResult {
		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			const selection: BuildRelationalQueryResult['selection'] = selectionEntries.map(([key, value]) => ({
				dbKey: value.name,
				tsKey: key,
				field: value,
				tableTsKey: undefined,
				isJson: false,
				selection: [],
			}));

			return {
				tableTsKey: tableConfig.tsName,
				sql: this.buildSelectQuery({
					table,
					fields: {},
					fieldsFlat: selectionEntries.map(([, c]) => ({
						path: [c.name],
						field: c as AnyPgColumn,
					})),
					groupBy: [],
					orderBy: [],
					joins: [],
					lockingClauses: [],
					withList: [],
				}),
				selection,
			};
		}

		const selection: Record<string, AnyPgColumn | SQL | SQL.Aliased> = {};
		let selectedColumns: string[] = [];
		let selectedCustomFields: { key: string; value: SQL | SQL.Aliased }[] = [];
		let selectedRelations: { key: string; value: true | DBQueryConfig }[] = [];

		if (config.select) {
			let isIncludeMode = false;

			for (const [field, value] of Object.entries(config.select)) {
				if (value === undefined) {
					continue;
				}

				if (field in tableConfig.columns) {
					if (!isIncludeMode && value === true) {
						isIncludeMode = true;
					}
					selectedColumns.push(field);
				} else {
					selectedRelations.push({ key: field, value });
				}
			}

			if (selectedColumns.length > 0) {
				selectedColumns = isIncludeMode
					? selectedColumns.filter((c) => config.select?.[c] === true)
					: Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
			}
		} else if (config.include) {
			selectedRelations = Object.entries(config.include)
				.filter((entry): entry is [typeof entry[0], NonNullable<typeof entry[1]>] => !!entry[1])
				.map(([key, value]) => ({
					key,
					value,
				}));
		}

		if (!config.select) {
			selectedColumns = Object.keys(tableConfig.columns);
		}

		if (config.includeCustom) {
			const includeCustom = config.includeCustom(tableConfig.columns, { sql });
			selectedCustomFields = Object.entries(includeCustom).map(([key, value]) => ({
				key,
				value,
			}));
		}

		for (const field of selectedColumns) {
			const column = tableConfig.columns[field] as AnyPgColumn;
			selection[field] = column;
		}

		for (const { key, value } of selectedCustomFields) {
			selection[key] = value;
		}

		const builtRelations: { key: string; value: BuildRelationalQueryResult }[] = [];
		const joins: JoinsValue[] = [];
		const builtRelationFields: SelectedFieldsOrdered = [];

		for (const { key: selectedRelationKey, value: selectedRelationValue } of selectedRelations) {
			let relation: Relation | undefined;
			for (const [relationKey, relationValue] of Object.entries(tableConfig.relations)) {
				if (relationValue instanceof Relation && relationKey === selectedRelationKey) {
					relation = relationValue;
					break;
				}
			}

			if (!relation) {
				throw new Error(`Relation ${selectedRelationKey} not found`);
			}

			const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);

			const relationAlias = `${tableAlias}_${selectedRelationKey}`;

			const builtRelation = this.buildRelationalQuery(
				fullSchema,
				schema,
				tableNamesMap,
				fullSchema[tableNamesMap[relation.referencedTable[Table.Symbol.Name]]!] as AnyPgTable,
				schema[tableNamesMap[relation.referencedTable[Table.Symbol.Name]]!]!,
				selectedRelationValue,
				relationAlias,
				normalizedRelation.references,
			);
			builtRelations.push({ key: selectedRelationKey, value: builtRelation });

			joins.push({
				table: new Subquery(builtRelation.sql, {}, relationAlias),
				alias: selectedRelationKey,
				on: and(
					...normalizedRelation.fields.map((field, i) =>
						eq(
							aliasedTableColumn(field, tableAlias),
							aliasedTableColumn(normalizedRelation.references[i]!, relationAlias),
						)
					),
				),
				joinType: 'left',
			});

			const elseField = sql`jsonb_agg(jsonb_build_array(${
				sql.join(
					builtRelation.selection.map(({ dbKey: key }) => {
						const field = sql`${sql.identifier(relationAlias)}.${sql.identifier(key)}`;
						return field;
						// return isJson ? sql`json(${field})` : field;
					}),
					sql`, `,
				)
			}))`;

			const field = sql`case when count(${
				sql.join(normalizedRelation.references.map((c) => aliasedTableColumn(c, relationAlias)), sql.raw(' or '))
			}) = 0 then ${relation instanceof One ? sql`null` : sql`'[]'`} else ${elseField} end`.as(selectedRelationKey);

			builtRelationFields.push({
				path: [selectedRelationKey],
				field: field,
			});
		}

		const unselectedRelationColumns = [...relationColumns];

		const flatSelection: SelectedFieldsOrdered = Object.entries(selection).map(([key, value]) => {
			if (value instanceof Column) {
				const valueIndex = unselectedRelationColumns.indexOf(value);
				if (valueIndex !== -1) {
					unselectedRelationColumns.splice(valueIndex, 1);
				}
				value = aliasedTableColumn(value, tableAlias);
			}
			return {
				path: [key],
				field: value,
			};
		});

		const relationColumnsSelection: SelectedFieldsOrdered = unselectedRelationColumns.map((column) => ({
			path: [column.name],
			field: aliasedTableColumn(column, tableAlias) as AnyPgColumn,
		}));

		const aliasedColumns = Object.fromEntries(
			Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
		);

		const aliasedRelations = Object.fromEntries(
			Object.entries(tableConfig.relations).map(([key, value]) => [key, aliasedRelation(value, tableAlias)]),
		);

		const aliasedFields = Object.assign({}, aliasedColumns, aliasedRelations);

		const where = and(
			...selectedRelations.filter(({ key }) => {
				const relation = config.include?.[key] ?? config.select?.[key];
				return typeof relation === 'object'
					&& ((relation as DBQueryConfig<'many'>).limit !== undefined
						|| (relation as DBQueryConfig<'many'>).offset !== undefined);
			}).map(({ key }) => {
				const field = sql`${sql.identifier(`${tableAlias}_${key}`)}.${sql.identifier('__drizzle_row_number')}`;
				const value = (config.include?.[key] ?? config.select?.[key]) as DBQueryConfig<'many'>;
				const cond = or(
					and(
						value.offset ? sql`${field} > ${value.offset}` : undefined,
						value.limit
							? sql`${field} <= ${value.offset ? sql`${value.offset}::bigint + ` : undefined}${value.limit}`
							: undefined,
					),
					sql`(${field} is null)`,
				);
				return cond;
			}),
		);

		const groupBy = (builtRelationFields.length
			? (tableConfig.primaryKey.length ? tableConfig.primaryKey : Object.values(tableConfig.columns)).map((c) =>
				aliasedTableColumn(c, tableAlias)
			)
			: []) as AnyPgColumn[];

		let orderBy = config.orderBy?.(aliasedFields, orderByOperators) as ValueOrArray<AnyPgColumn | SQL> ?? [];
		if (!Array.isArray(orderBy)) {
			orderBy = [orderBy];
		}

		const fieldsFlat: SelectedFieldsOrdered = [
			...flatSelection,
			...relationColumnsSelection,
			...builtRelationFields,
		];

		let limit, offset;

		if (config.limit !== undefined || config.offset !== undefined) {
			if (isRoot) {
				limit = config.limit;
				offset = config.offset;
			} else {
				fieldsFlat.push({
					path: ['__drizzle_row_number'],
					field: sql`row_number() over(partition by ${relationColumns.map((c) => aliasedTableColumn(c, tableAlias))})`
						.as('__drizzle_row_number'),
				});
			}
		}

		let result = this.buildSelectQuery({
			table: aliasedTable(table, tableAlias),
			fields: {},
			fieldsFlat,
			where,
			groupBy,
			orderBy,
			joins,
			lockingClauses: [],
			withList: [],
			limit,
			offset,
		});

		if (config.where) {
			result = this.buildSelectQuery({
				table: new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: fieldsFlat.map(({ path, field }) => ({
					path,
					field: field instanceof SQL.Aliased
						? sql`${sql.identifier(field.fieldAlias)}`
						: field,
				})),
				where: config.where(aliasedFields, operators),
				groupBy: [],
				orderBy: [],
				joins: [],
				lockingClauses: [],
				withList: [],
			});
		}

		return {
			tableTsKey: tableConfig.tsName,
			sql: result,
			selection: [
				...flatSelection.map(({ path, field }) => ({
					dbKey: field instanceof SQL.Aliased ? field.fieldAlias : tableConfig.columns[path[0]!]!.name,
					tsKey: path[0]!,
					field,
					tableTsKey: undefined,
					isJson: false,
					selection: [],
				})),
				...builtRelations.map(({ key, value }) => ({
					dbKey: key,
					tsKey: key,
					field: undefined,
					tableTsKey: value.tableTsKey,
					isJson: true,
					selection: value.selection,
				})),
			],
		};
	}
}
