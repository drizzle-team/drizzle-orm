import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import {
	type BuildRelationalQueryResult,
	type DBQueryConfig,
	getOperators,
	getOrderByOperators,
	Many,
	normalizeRelation,
	One,
	type Relation,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { Param, type QueryWithTypings, SQL, sql, type SQLChunk, View } from '~/sql/sql.ts';
import { Subquery, SubqueryConfig } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { and, DrizzleError, eq, type Name, ViewBaseConfig } from '../index.ts';
import { MySqlColumn } from './columns/common.ts';
import type { MySqlDeleteConfig } from './query-builders/delete.ts';
import type { MySqlInsertConfig } from './query-builders/insert.ts';
import type { MySqlSelectConfig, MySqlSelectJoinConfig, SelectedFieldsOrdered } from './query-builders/select.types.ts';
import type { MySqlUpdateConfig } from './query-builders/update.ts';
import type { MySqlSession } from './session.ts';
import { MySqlTable } from './table.ts';
import { MySqlViewBase } from './view-base.ts';

export class MySqlDialect {
	static readonly [entityKind]: string = 'MySqlDialect';

	async migrate(migrations: MigrationMeta[], session: MySqlSession, config: MigrationConfig): Promise<void> {
		const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
		const migrationTableCreate = sql`
			create table if not exists ${sql.identifier(migrationsTable)} (
				id serial primary key,
				hash text not null,
				created_at bigint
			)
		`;
		await session.execute(migrationTableCreate);

		const dbMigrations = await session.all<{ id: number; hash: string; created_at: string }>(
			sql`select id, hash, created_at from ${sql.identifier(migrationsTable)} order by created_at desc limit 1`,
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
							sql.identifier(migrationsTable)
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

	buildUpdateSet(table: MySqlTable, set: UpdateSet): SQL {
		const setEntries = Object.entries(set);
		const tableColumns = table[Table.Symbol.Columns];

		const setSize = setEntries.length;
		const setSql = sql.join(
			setEntries
				.flatMap(([colName, value], i): SQL[] => {
					const col: MySqlColumn = tableColumns[colName]!;
					const res = sql`${sql.identifier(col.name)} = ${value}`;
					if (i < setSize - 1) {
						return [res, sql.raw(', ')];
					}
					return [res];
				}),
		);

		// I don't really like the overhead of this additional for loop.
		// Maybe we can add a `has onUpdateFn` flag to the tables?
		for (const colName in tableColumns) {
			const col = tableColumns[colName]!;
			if (!set[colName] && col.onUpdateFn !== undefined) {
				const value = col.onUpdateFn();
				setSql.append(sql`${sql.identifier(col.name)} = ${value}`);
			}
		}

		return setSql;
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

				if (is(field, SQL.Aliased) && field.isSelectionField) {
					chunk.push(sql.identifier(field.fieldAlias));
				} else if (is(field, SQL.Aliased) || is(field, SQL)) {
					const query = is(field, SQL.Aliased) ? field.sql : field;

					if (isSingleTable) {
						chunk.push(
							new SQL(
								query.queryChunks.map((c) => {
									if (is(c, MySqlColumn)) {
										return sql.identifier(c.name);
									}
									return c;
								}),
							),
						);
					} else {
						chunk.push(query);
					}

					if (is(field, SQL.Aliased)) {
						chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
					}
				} else if (is(field, Column)) {
					if (isSingleTable) {
						chunk.push(sql.identifier(field.name));
					} else {
						chunk.push(field);
					}
				}

				if (i < columnsLen - 1) {
					chunk.push(sql`, `);
				}

				return chunk;
			});

		return sql.join(chunks);
	}

	buildSelectQuery(
		{
			withList,
			fields,
			fieldsFlat,
			where,
			having,
			table,
			joins,
			orderBy,
			groupBy,
			limit,
			offset,
			lockingClause,
			distinct,
			setOperators,
		}: MySqlSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<MySqlColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table[SubqueryConfig].alias
						: is(table, MySqlViewBase)
						? table[ViewBaseConfig].name
						: is(table, SQL)
						? undefined
						: getTableName(table))
				&& !((table) =>
					joins?.some(({ alias }) =>
						alias === (table[Table.Symbol.IsAlias] ? getTableName(table) : table[Table.Symbol.BaseName])
					))(f.field.table)
			) {
				const tableName = getTableName(f.field.table);
				throw new Error(
					`Your "${
						f.path.join('->')
					}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`,
				);
			}
		}

		const isSingleTable = !joins || joins.length === 0;

		let withSql: SQL | undefined;
		if (withList?.length) {
			const withSqlChunks = [sql`with `];
			for (const [i, w] of withList.entries()) {
				withSqlChunks.push(sql`${sql.identifier(w[SubqueryConfig].alias)} as (${w[SubqueryConfig].sql})`);
				if (i < withList.length - 1) {
					withSqlChunks.push(sql`, `);
				}
			}
			withSqlChunks.push(sql` `);
			withSql = sql.join(withSqlChunks);
		}

		const distinctSql = distinct ? sql` distinct` : undefined;

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = (() => {
			if (is(table, Table) && table[Table.Symbol.OriginalName] !== table[Table.Symbol.Name]) {
				return sql`${sql.identifier(table[Table.Symbol.OriginalName])} ${sql.identifier(table[Table.Symbol.Name])}`;
			}

			return table;
		})();

		const joinsArray: SQL[] = [];

		if (joins) {
			for (const [index, joinMeta] of joins.entries()) {
				if (index === 0) {
					joinsArray.push(sql` `);
				}
				const table = joinMeta.table;
				const lateralSql = joinMeta.lateral ? sql` lateral` : undefined;

				if (is(table, MySqlTable)) {
					const tableName = table[MySqlTable.Symbol.Name];
					const tableSchema = table[MySqlTable.Symbol.Schema];
					const origTableName = table[MySqlTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
							tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
						}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`} on ${joinMeta.on}`,
					);
				} else if (is(table, View)) {
					const viewName = table[ViewBaseConfig].name;
					const viewSchema = table[ViewBaseConfig].schema;
					const origViewName = table[ViewBaseConfig].originalName;
					const alias = viewName === origViewName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
							viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined
						}${sql.identifier(origViewName)}${alias && sql` ${sql.identifier(alias)}`} on ${joinMeta.on}`,
					);
				} else {
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${table} on ${joinMeta.on}`,
					);
				}
				if (index < joins.length - 1) {
					joinsArray.push(sql` `);
				}
			}
		}

		const joinsSql = sql.join(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			orderBySql = sql` order by ${sql.join(orderBy, sql`, `)}`;
		}

		let groupBySql;
		if (groupBy && groupBy.length > 0) {
			groupBySql = sql` group by ${sql.join(groupBy, sql`, `)}`;
		}

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

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(leftSelect: SQL, setOperators: MySqlSelectConfig['setOperators']): SQL {
		const [setOperator, ...rest] = setOperators;

		if (!setOperator) {
			throw new Error('Cannot pass undefined values to any set operator');
		}

		if (rest.length === 0) {
			return this.buildSetOperationQuery({ leftSelect, setOperator });
		}

		// Some recursive magic here
		return this.buildSetOperations(
			this.buildSetOperationQuery({ leftSelect, setOperator }),
			rest,
		);
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator: { type, isAll, rightSelect, limit, orderBy, offset },
	}: { leftSelect: SQL; setOperator: MySqlSelectConfig['setOperators'][number] }): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MySql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderByUnit of orderBy) {
				if (is(orderByUnit, MySqlColumn)) {
					orderByValues.push(sql.identifier(orderByUnit.name));
				} else if (is(orderByUnit, SQL)) {
					for (let i = 0; i < orderByUnit.queryChunks.length; i++) {
						const chunk = orderByUnit.queryChunks[i];

						if (is(chunk, MySqlColumn)) {
							orderByUnit.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${orderByUnit}`);
				} else {
					orderByValues.push(sql`${orderByUnit}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)} `;
		}

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, values, ignore, onConflict }: MySqlInsertConfig): SQL {
		// const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, MySqlColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, MySqlColumn][] = Object.entries(columns);

		const insertOrder = colEntries.map(([, column]) => sql.identifier(column.name));

		for (const [valueIndex, value] of values.entries()) {
			const valueList: (SQLChunk | SQL)[] = [];
			for (const [fieldName, col] of colEntries) {
				const colValue = value[fieldName];
				if (colValue === undefined || (is(colValue, Param) && colValue.value === undefined)) {
					// eslint-disable-next-line unicorn/no-negated-condition
					if (col.defaultFn !== undefined) {
						const defaultFnResult = col.defaultFn();
						const defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
						valueList.push(defaultValue);
						// eslint-disable-next-line unicorn/no-negated-condition
					} else if (col.onUpdateFn !== undefined) {
						const onUpdateFnResult = col.onUpdateFn();
						const newValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
						valueList.push(newValue);
					} else {
						valueList.push(sql`default`);
					}
				} else {
					valueList.push(colValue);
				}
			}
			valuesSqlList.push(valueList);
			if (valueIndex < values.length - 1) {
				valuesSqlList.push(sql`, `);
			}
		}

		const valuesSql = sql.join(valuesSqlList);

		const ignoreSql = ignore ? sql` ignore` : undefined;

		const onConflictSql = onConflict ? sql` on duplicate key ${onConflict}` : undefined;

		return sql`insert${ignoreSql} into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}`;
	}

	sqlToQuery(sql: SQL): QueryWithTypings {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
		});
	}

	buildRelationalQuery({
		fullSchema,
		schema,
		tableNamesMap,
		table,
		tableConfig,
		queryConfig: config,
		tableAlias,
		nestedQueryRelation,
		joinOn,
	}: {
		fullSchema: Record<string, unknown>;
		schema: TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: MySqlTable;
		tableConfig: TableRelationalConfig;
		queryConfig: true | DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: Relation;
		joinOn?: SQL;
	}): BuildRelationalQueryResult<MySqlTable, MySqlColumn> {
		let selection: BuildRelationalQueryResult<MySqlTable, MySqlColumn>['selection'] = [];
		let limit, offset, orderBy: MySqlSelectConfig['orderBy'], where;
		const joins: MySqlSelectJoinConfig[] = [];

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map((
				[key, value],
			) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as MySqlColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: { tsKey: string; value: MySqlColumn | SQL.Aliased }[] = [];
			let selectedColumns: string[] = [];

			// Figure out which columns to select
			if (config.columns) {
				let isIncludeMode = false;

				for (const [field, value] of Object.entries(config.columns)) {
					if (value === undefined) {
						continue;
					}

					if (field in tableConfig.columns) {
						if (!isIncludeMode && value === true) {
							isIncludeMode = true;
						}
						selectedColumns.push(field);
					}
				}

				if (selectedColumns.length > 0) {
					selectedColumns = isIncludeMode
						? selectedColumns.filter((c) => config.columns?.[c] === true)
						: Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
				}
			} else {
				// Select all columns if selection is not specified
				selectedColumns = Object.keys(tableConfig.columns);
			}

			for (const field of selectedColumns) {
				const column = tableConfig.columns[field]! as MySqlColumn;
				fieldsSelection.push({ tsKey: field, value: column });
			}

			let selectedRelations: {
				tsKey: string;
				queryConfig: true | DBQueryConfig<'many', false>;
				relation: Relation;
			}[] = [];

			// Figure out which relations to select
			if (config.with) {
				selectedRelations = Object.entries(config.with)
					.filter((entry): entry is [typeof entry[0], NonNullable<typeof entry[1]>] => !!entry[1])
					.map(([tsKey, queryConfig]) => ({ tsKey, queryConfig, relation: tableConfig.relations[tsKey]! }));
			}

			let extras;

			// Figure out which extras to select
			if (config.extras) {
				extras = typeof config.extras === 'function'
					? config.extras(aliasedColumns, { sql })
					: config.extras;
				for (const [tsKey, value] of Object.entries(extras)) {
					fieldsSelection.push({
						tsKey,
						value: mapColumnsInAliasedSQLToAlias(value, tableAlias),
					});
				}
			}

			// Transform `fieldsSelection` into `selection`
			// `fieldsSelection` shouldn't be used after this point
			for (const { tsKey, value } of fieldsSelection) {
				selection.push({
					dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey]!.name,
					tsKey,
					field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
					relationTableTsKey: undefined,
					isJson: false,
					selection: [],
				});
			}

			let orderByOrig = typeof config.orderBy === 'function'
				? config.orderBy(aliasedColumns, getOrderByOperators())
				: config.orderBy ?? [];
			if (!Array.isArray(orderByOrig)) {
				orderByOrig = [orderByOrig];
			}
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) {
					return aliasedTableColumn(orderByValue, tableAlias) as MySqlColumn;
				}
				return mapColumnsInSQLToAlias(orderByValue, tableAlias);
			});

			limit = config.limit;
			offset = config.offset;

			// Process all relations
			for (
				const {
					tsKey: selectedRelationTsKey,
					queryConfig: selectedRelationConfigValue,
					relation,
				} of selectedRelations
			) {
				const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
				const relationTableName = relation.referencedTable[Table.Symbol.Name];
				const relationTableTsName = tableNamesMap[relationTableName]!;
				const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
				const joinOn = and(
					...normalizedRelation.fields.map((field, i) =>
						eq(
							aliasedTableColumn(normalizedRelation.references[i]!, relationTableAlias),
							aliasedTableColumn(field, tableAlias),
						)
					),
				);
				const builtRelation = this.buildRelationalQuery({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as MySqlTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, One)
						? (selectedRelationConfigValue === true
							? { limit: 1 }
							: { ...selectedRelationConfigValue, limit: 1 })
						: selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn,
					nestedQueryRelation: relation,
				});
				const field = sql`${sql.identifier(relationTableAlias)}.${sql.identifier('data')}`.as(selectedRelationTsKey);
				joins.push({
					on: sql`true`,
					table: new Subquery(builtRelation.sql as SQL, {}, relationTableAlias),
					alias: relationTableAlias,
					joinType: 'left',
					lateral: true,
				});
				selection.push({
					dbKey: selectedRelationTsKey,
					tsKey: selectedRelationTsKey,
					field,
					relationTableTsKey: relationTableTsName,
					isJson: true,
					selection: builtRelation.selection,
				});
			}
		}

		if (selection.length === 0) {
			throw new DrizzleError({ message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}")` });
		}

		let result;

		where = and(joinOn, where);

		if (nestedQueryRelation) {
			let field = sql`json_array(${
				sql.join(
					selection.map(({ field, tsKey, isJson }) =>
						isJson
							? sql`${sql.identifier(`${tableAlias}_${tsKey}`)}.${sql.identifier('data')}`
							: is(field, SQL.Aliased)
							? field.sql
							: field
					),
					sql`, `,
				)
			})`;
			if (is(nestedQueryRelation, Many)) {
				field = sql`coalesce(json_arrayagg(${field}), json_array())`;
			}
			const nestedSelection = [{
				dbKey: 'data',
				tsKey: 'data',
				field: field.as('data'),
				isJson: true,
				relationTableTsKey: tableConfig.tsName,
				selection,
			}];

			const needsSubquery = limit !== undefined || offset !== undefined || (orderBy?.length ?? 0) > 0;

			if (needsSubquery) {
				result = this.buildSelectQuery({
					table: aliasedTable(table, tableAlias),
					fields: {},
					fieldsFlat: [
						{
							path: [],
							field: sql.raw('*'),
						},
						...(((orderBy?.length ?? 0) > 0)
							? [{
								path: [],
								field: sql`row_number() over (order by ${sql.join(orderBy!, sql`, `)})`,
							}]
							: []),
					],
					where,
					limit,
					offset,
					setOperators: [],
				});

				where = undefined;
				limit = undefined;
				offset = undefined;
				orderBy = undefined;
			} else {
				result = aliasedTable(table, tableAlias);
			}

			result = this.buildSelectQuery({
				table: is(result, MySqlTable) ? result : new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: nestedSelection.map(({ field }) => ({
					path: [],
					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
				})),
				joins,
				where,
				limit,
				offset,
				orderBy,
				setOperators: [],
			});
		} else {
			result = this.buildSelectQuery({
				table: aliasedTable(table, tableAlias),
				fields: {},
				fieldsFlat: selection.map(({ field }) => ({
					path: [],
					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
				})),
				joins,
				where,
				limit,
				offset,
				orderBy,
				setOperators: [],
			});
		}

		return {
			tableTsKey: tableConfig.tsName,
			sql: result,
			selection,
		};
	}

	buildRelationalQueryWithoutLateralSubqueries({
		fullSchema,
		schema,
		tableNamesMap,
		table,
		tableConfig,
		queryConfig: config,
		tableAlias,
		nestedQueryRelation,
		joinOn,
	}: {
		fullSchema: Record<string, unknown>;
		schema: TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: MySqlTable;
		tableConfig: TableRelationalConfig;
		queryConfig: true | DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: Relation;
		joinOn?: SQL;
	}): BuildRelationalQueryResult<MySqlTable, MySqlColumn> {
		let selection: BuildRelationalQueryResult<MySqlTable, MySqlColumn>['selection'] = [];
		let limit, offset, orderBy: MySqlSelectConfig['orderBy'] = [], where;

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map((
				[key, value],
			) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as MySqlColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: { tsKey: string; value: MySqlColumn | SQL.Aliased }[] = [];
			let selectedColumns: string[] = [];

			// Figure out which columns to select
			if (config.columns) {
				let isIncludeMode = false;

				for (const [field, value] of Object.entries(config.columns)) {
					if (value === undefined) {
						continue;
					}

					if (field in tableConfig.columns) {
						if (!isIncludeMode && value === true) {
							isIncludeMode = true;
						}
						selectedColumns.push(field);
					}
				}

				if (selectedColumns.length > 0) {
					selectedColumns = isIncludeMode
						? selectedColumns.filter((c) => config.columns?.[c] === true)
						: Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
				}
			} else {
				// Select all columns if selection is not specified
				selectedColumns = Object.keys(tableConfig.columns);
			}

			for (const field of selectedColumns) {
				const column = tableConfig.columns[field]! as MySqlColumn;
				fieldsSelection.push({ tsKey: field, value: column });
			}

			let selectedRelations: {
				tsKey: string;
				queryConfig: true | DBQueryConfig<'many', false>;
				relation: Relation;
			}[] = [];

			// Figure out which relations to select
			if (config.with) {
				selectedRelations = Object.entries(config.with)
					.filter((entry): entry is [typeof entry[0], NonNullable<typeof entry[1]>] => !!entry[1])
					.map(([tsKey, queryConfig]) => ({ tsKey, queryConfig, relation: tableConfig.relations[tsKey]! }));
			}

			let extras;

			// Figure out which extras to select
			if (config.extras) {
				extras = typeof config.extras === 'function'
					? config.extras(aliasedColumns, { sql })
					: config.extras;
				for (const [tsKey, value] of Object.entries(extras)) {
					fieldsSelection.push({
						tsKey,
						value: mapColumnsInAliasedSQLToAlias(value, tableAlias),
					});
				}
			}

			// Transform `fieldsSelection` into `selection`
			// `fieldsSelection` shouldn't be used after this point
			for (const { tsKey, value } of fieldsSelection) {
				selection.push({
					dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey]!.name,
					tsKey,
					field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
					relationTableTsKey: undefined,
					isJson: false,
					selection: [],
				});
			}

			let orderByOrig = typeof config.orderBy === 'function'
				? config.orderBy(aliasedColumns, getOrderByOperators())
				: config.orderBy ?? [];
			if (!Array.isArray(orderByOrig)) {
				orderByOrig = [orderByOrig];
			}
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) {
					return aliasedTableColumn(orderByValue, tableAlias) as MySqlColumn;
				}
				return mapColumnsInSQLToAlias(orderByValue, tableAlias);
			});

			limit = config.limit;
			offset = config.offset;

			// Process all relations
			for (
				const {
					tsKey: selectedRelationTsKey,
					queryConfig: selectedRelationConfigValue,
					relation,
				} of selectedRelations
			) {
				const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
				const relationTableName = relation.referencedTable[Table.Symbol.Name];
				const relationTableTsName = tableNamesMap[relationTableName]!;
				const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
				const joinOn = and(
					...normalizedRelation.fields.map((field, i) =>
						eq(
							aliasedTableColumn(normalizedRelation.references[i]!, relationTableAlias),
							aliasedTableColumn(field, tableAlias),
						)
					),
				);
				const builtRelation = this.buildRelationalQueryWithoutLateralSubqueries({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as MySqlTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, One)
						? (selectedRelationConfigValue === true
							? { limit: 1 }
							: { ...selectedRelationConfigValue, limit: 1 })
						: selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn,
					nestedQueryRelation: relation,
				});
				let fieldSql = sql`(${builtRelation.sql})`;
				if (is(relation, Many)) {
					fieldSql = sql`coalesce(${fieldSql}, json_array())`;
				}
				const field = fieldSql.as(selectedRelationTsKey);
				selection.push({
					dbKey: selectedRelationTsKey,
					tsKey: selectedRelationTsKey,
					field,
					relationTableTsKey: relationTableTsName,
					isJson: true,
					selection: builtRelation.selection,
				});
			}
		}

		if (selection.length === 0) {
			throw new DrizzleError({
				message:
					`No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`,
			});
		}

		let result;

		where = and(joinOn, where);

		if (nestedQueryRelation) {
			let field = sql`json_array(${
				sql.join(
					selection.map(({ field }) =>
						is(field, MySqlColumn) ? sql.identifier(field.name) : is(field, SQL.Aliased) ? field.sql : field
					),
					sql`, `,
				)
			})`;
			if (is(nestedQueryRelation, Many)) {
				field = sql`json_arrayagg(${field})`;
			}
			const nestedSelection = [{
				dbKey: 'data',
				tsKey: 'data',
				field,
				isJson: true,
				relationTableTsKey: tableConfig.tsName,
				selection,
			}];

			const needsSubquery = limit !== undefined || offset !== undefined || orderBy.length > 0;

			if (needsSubquery) {
				result = this.buildSelectQuery({
					table: aliasedTable(table, tableAlias),
					fields: {},
					fieldsFlat: [
						{
							path: [],
							field: sql.raw('*'),
						},
						...(orderBy.length > 0)
							? [{
								path: [],
								field: sql`row_number() over (order by ${sql.join(orderBy, sql`, `)})`,
							}]
							: [],
					],
					where,
					limit,
					offset,
					setOperators: [],
				});

				where = undefined;
				limit = undefined;
				offset = undefined;
				orderBy = undefined;
			} else {
				result = aliasedTable(table, tableAlias);
			}

			result = this.buildSelectQuery({
				table: is(result, MySqlTable) ? result : new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: nestedSelection.map(({ field }) => ({
					path: [],
					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
				})),
				where,
				limit,
				offset,
				orderBy,
				setOperators: [],
			});
		} else {
			result = this.buildSelectQuery({
				table: aliasedTable(table, tableAlias),
				fields: {},
				fieldsFlat: selection.map(({ field }) => ({
					path: [],
					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
				})),
				where,
				limit,
				offset,
				orderBy,
				setOperators: [],
			});
		}

		return {
			tableTsKey: tableConfig.tsName,
			sql: result,
			selection,
		};
	}
}
