import * as V1 from '~/_relations.ts';
import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { and, eq } from '~/expressions.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import type {
	BuildRelationalQueryResult,
	ColumnWithTSName,
	DBQueryConfig,
	Relation,
	TableRelationalConfig,
	TablesRelationalConfig,
	WithContainer,
} from '~/relations.ts';
import {
	// AggregatedField,
	getTableAsAliasSQL,
	One,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
} from '~/relations.ts';
import { isSQLWrapper, Param, SQL, sql, View } from '~/sql/sql.ts';
import type { Name, Placeholder, QueryWithTypings, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Columns, getTableName, getTableUniqueName, Table } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { MySqlColumn } from './columns/common.ts';
import type { MySqlDeleteConfig } from './query-builders/delete.ts';
import type { MySqlInsertConfig } from './query-builders/insert.ts';
import type {
	AnyMySqlSelectQueryBuilder,
	MySqlSelectConfig,
	MySqlSelectJoinConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { MySqlUpdateConfig } from './query-builders/update.ts';
import type { MySqlSession } from './session.ts';
import { MySqlTable } from './table.ts';
import { MySqlViewBase } from './view-base.ts';
import type { MySqlView } from './view.ts';

export interface MySqlDialectConfig {
	casing?: Casing;
}

export class MySqlDialect {
	static readonly [entityKind]: string = 'MySqlDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: MySqlDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	async migrate(
		migrations: MigrationMeta[],
		session: MySqlSession,
		config: Omit<MigrationConfig, 'migrationsSchema'>,
	): Promise<void> {
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

	private buildWithCTE(queries: Subquery[] | undefined): SQL | undefined {
		if (!queries?.length) return undefined;

		const withSqlChunks = [sql`with `];
		for (const [i, w] of queries.entries()) {
			withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
			if (i < queries.length - 1) {
				withSqlChunks.push(sql`, `);
			}
		}
		withSqlChunks.push(sql` `);
		return sql.join(withSqlChunks);
	}

	buildDeleteQuery({ table, where, returning, withList, limit, orderBy }: MySqlDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}delete from ${table}${whereSql}${orderBySql}${limitSql}${returningSql}`;
	}

	buildUpdateSet(table: MySqlTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter((colName) =>
			set[colName] !== undefined || tableColumns[colName]?.onUpdateFn !== undefined
		);

		const setSize = columnNames.length;
		return sql.join(columnNames.flatMap((colName, i) => {
			const col = tableColumns[colName]!;

			const value = set[colName] ?? sql.param(col.onUpdateFn!(), col);
			const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;

			if (i < setSize - 1) {
				return [res, sql.raw(', ')];
			}
			return [res];
		}));
	}

	buildUpdateQuery({ table, set, where, returning, withList, limit, orderBy }: MySqlUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}update ${table} set ${setSql}${whereSql}${orderBySql}${limitSql}${returningSql}`;
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
										return sql.identifier(this.casing.getColumnCasing(c));
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
						chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
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

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;
	}

	private buildOrderBy(orderBy: (MySqlColumn | SQL | SQL.Aliased)[] | undefined): SQL | undefined {
		return orderBy && orderBy.length > 0 ? sql` order by ${sql.join(orderBy, sql`, `)}` : undefined;
	}

	private buildIndex({
		indexes,
		indexFor,
	}: {
		indexes: string[] | undefined;
		indexFor: 'USE' | 'FORCE' | 'IGNORE';
	}): SQL | undefined {
		return indexes && indexes.length > 0
			? sql` ${sql.raw(indexFor)} INDEX (${sql.raw(indexes.join(`, `))})`
			: undefined;
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
			useIndex,
			forceIndex,
			ignoreIndex,
		}: MySqlSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<MySqlColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
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

		const withSql = this.buildWithCTE(withList);

		const distinctSql = distinct ? sql` distinct` : undefined;

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = (() => {
			if (is(table, Table) && table[Table.Symbol.IsAlias]) {
				return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? '')}.`.if(table[Table.Symbol.Schema])}${
					sql.identifier(table[Table.Symbol.OriginalName])
				} ${sql.identifier(table[Table.Symbol.Name])}`;
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
					const useIndexSql = this.buildIndex({ indexes: joinMeta.useIndex, indexFor: 'USE' });
					const forceIndexSql = this.buildIndex({ indexes: joinMeta.forceIndex, indexFor: 'FORCE' });
					const ignoreIndexSql = this.buildIndex({ indexes: joinMeta.ignoreIndex, indexFor: 'IGNORE' });
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
							tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
						}${sql.identifier(origTableName)}${useIndexSql}${forceIndexSql}${ignoreIndexSql}${
							alias && sql` ${sql.identifier(alias)}`
						} on ${joinMeta.on}`,
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

		const orderBySql = this.buildOrderBy(orderBy);

		const groupBySql = groupBy && groupBy.length > 0 ? sql` group by ${sql.join(groupBy, sql`, `)}` : undefined;

		const limitSql = this.buildLimit(limit);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		const useIndexSql = this.buildIndex({ indexes: useIndex, indexFor: 'USE' });

		const forceIndexSql = this.buildIndex({ indexes: forceIndex, indexFor: 'FORCE' });

		const ignoreIndexSql = this.buildIndex({ indexes: ignoreIndex, indexFor: 'IGNORE' });

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
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${useIndexSql}${forceIndexSql}${ignoreIndexSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}`;

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
					orderByValues.push(sql.identifier(this.casing.getColumnCasing(orderByUnit)));
				} else if (is(orderByUnit, SQL)) {
					for (let i = 0; i < orderByUnit.queryChunks.length; i++) {
						const chunk = orderByUnit.queryChunks[i];

						if (is(chunk, MySqlColumn)) {
							orderByUnit.queryChunks[i] = sql.identifier(this.casing.getColumnCasing(chunk));
						}
					}

					orderByValues.push(sql`${orderByUnit}`);
				} else {
					orderByValues.push(sql`${orderByUnit}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)} `;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery(
		{ table, values: valuesOrSelect, ignore, onConflict, select }: MySqlInsertConfig,
	): { sql: SQL; generatedIds: Record<string, unknown>[] } {
		// const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, MySqlColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, MySqlColumn][] = Object.entries(columns).filter(([_, col]) =>
			!col.shouldDisableInsert()
		);

		const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));
		const generatedIdsResponse: Record<string, unknown>[] = [];

		if (select) {
			const select = valuesOrSelect as AnyMySqlSelectQueryBuilder | SQL;

			if (is(select, SQL)) {
				valuesSqlList.push(select);
			} else {
				valuesSqlList.push(select.getSQL());
			}
		} else {
			const values = valuesOrSelect as Record<string, Param | SQL>[];
			valuesSqlList.push(sql.raw('values '));

			for (const [valueIndex, value] of values.entries()) {
				const generatedIds: Record<string, unknown> = {};

				const valueList: (SQLChunk | SQL)[] = [];
				for (const [fieldName, col] of colEntries) {
					const colValue = value[fieldName];
					if (colValue === undefined || (is(colValue, Param) && colValue.value === undefined)) {
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							generatedIds[fieldName] = defaultFnResult;
							const defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
							valueList.push(defaultValue);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							const newValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
							valueList.push(newValue);
						} else {
							valueList.push(sql`default`);
						}
					} else {
						if (col.defaultFn && is(colValue, Param)) {
							generatedIds[fieldName] = colValue.value;
						}
						valueList.push(colValue);
					}
				}

				generatedIdsResponse.push(generatedIds);
				valuesSqlList.push(valueList);
				if (valueIndex < values.length - 1) {
					valuesSqlList.push(sql`, `);
				}
			}
		}

		const valuesSql = sql.join(valuesSqlList);

		const ignoreSql = ignore ? sql` ignore` : undefined;

		const onConflictSql = onConflict ? sql` on duplicate key ${onConflict}` : undefined;

		return {
			sql: sql`insert${ignoreSql} into ${table} ${insertOrder} ${valuesSql}${onConflictSql}`,
			generatedIds: generatedIdsResponse,
		};
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): QueryWithTypings {
		return sql.toQuery({
			casing: this.casing,
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			invokeSource,
		});
	}

	/** @deprecated */
	_buildRelationalQuery({
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
		schema: V1.TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: MySqlTable;
		tableConfig: V1.TableRelationalConfig;
		queryConfig: true | V1.DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: V1.Relation;
		joinOn?: SQL;
	}): V1.BuildRelationalQueryResult<MySqlTable, MySqlColumn> {
		let selection: V1.BuildRelationalQueryResult<MySqlTable, MySqlColumn>['selection'] = [];
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
					? config.where(aliasedColumns, V1.getOperators())
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
				queryConfig: true | V1.DBQueryConfig<'many', false>;
				relation: V1.Relation;
			}[] = [];

			// Figure out which V1.relations to select
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
				? config.orderBy(aliasedColumns, V1.getOrderByOperators())
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

			// Process all V1.relations
			for (
				const {
					tsKey: selectedRelationTsKey,
					queryConfig: selectedRelationConfigValue,
					relation,
				} of selectedRelations
			) {
				const normalizedRelation = V1.normalizeRelation(schema, tableNamesMap, relation);
				const relationTableName = getTableUniqueName(relation.referencedTable);
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
				const builtRelation = this._buildRelationalQuery({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as MySqlTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, V1.One)
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
			if (is(nestedQueryRelation, V1.Many)) {
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

	/** @deprecated */
	_buildRelationalQueryWithoutLateralSubqueries({
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
		schema: V1.TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: MySqlTable;
		tableConfig: V1.TableRelationalConfig;
		queryConfig: true | V1.DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: V1.Relation;
		joinOn?: SQL;
	}): V1.BuildRelationalQueryResult<MySqlTable, MySqlColumn> {
		let selection: V1.BuildRelationalQueryResult<MySqlTable, MySqlColumn>['selection'] = [];
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
					? config.where(aliasedColumns, V1.getOperators())
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
				queryConfig: true | V1.DBQueryConfig<'many', false>;
				relation: V1.Relation;
			}[] = [];

			// Figure out which V1.relations to select
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
				? config.orderBy(aliasedColumns, V1.getOrderByOperators())
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

			// Process all V1.relations
			for (
				const {
					tsKey: selectedRelationTsKey,
					queryConfig: selectedRelationConfigValue,
					relation,
				} of selectedRelations
			) {
				const normalizedRelation = V1.normalizeRelation(schema, tableNamesMap, relation);
				const relationTableName = getTableUniqueName(relation.referencedTable);
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
				const builtRelation = this._buildRelationalQueryWithoutLateralSubqueries({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as MySqlTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, V1.One)
						? (selectedRelationConfigValue === true
							? { limit: 1 }
							: { ...selectedRelationConfigValue, limit: 1 })
						: selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn,
					nestedQueryRelation: relation,
				});
				let fieldSql = sql`(${builtRelation.sql})`;
				if (is(relation, V1.Many)) {
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
						is(field, MySqlColumn)
							? sql.identifier(this.casing.getColumnCasing(field))
							: is(field, SQL.Aliased)
							? field.sql
							: field
					),
					sql`, `,
				)
			})`;
			if (is(nestedQueryRelation, V1.Many)) {
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

	private nestedSelectionerror() {
		throw new DrizzleError({
			message: `Views with nested selections are not supported by the relational query builder`,
		});
	}

	private buildRqbColumn(table: Table | View, column: unknown, key: string) {
		if (is(column, Column)) {
			const name = sql`${table}.${sql.identifier(this.casing.getColumnCasing(column))}`;

			switch (column.columnType) {
				case 'MySqlBinary':
				case 'MySqlVarBinary':
				case 'MySqlTime':
				case 'MySqlDateTimeString':
				case 'MySqlTimestampString':
				case 'MySqlFloat':
				case 'MySqlDecimal':
				case 'MySqlDecimalNumber':
				case 'MySqlDecimalBigInt':
				case 'MySqlBigInt64': {
					return sql`cast(${name} as char) as ${sql.identifier(key)}`;
				}

				default: {
					return sql`${name} as ${sql.identifier(key)}`;
				}
			}
		}

		return sql`${table}.${
			is(column, SQL.Aliased)
				? sql.identifier(column.fieldAlias)
				: isSQLWrapper(column)
				? sql.identifier(key)
				: this.nestedSelectionerror()
		} as ${sql.identifier(key)}`;
	}

	private unwrapAllColumns = (table: Table | View, selection: BuildRelationalQueryResult['selection']) => {
		return sql.join(
			Object.entries(table[Columns]).map(([k, v]) => {
				selection.push({
					key: k,
					field: v as Column | SQL | SQLWrapper | SQL.Aliased,
				});

				return this.buildRqbColumn(table, v, k);
			}),
			sql`, `,
		);
	};

	private getSelectedTableColumns = (table: Table | View, columns: Record<string, boolean | undefined>) => {
		const selectedColumns: ColumnWithTSName[] = [];
		const columnContainer = table[Columns];
		const entries = Object.entries(columns);

		let colSelectionMode: boolean | undefined;
		for (const [k, v] of entries) {
			if (v === undefined) continue;
			colSelectionMode = colSelectionMode || v;

			if (v) {
				const column = columnContainer[k]!;

				selectedColumns.push({
					column: column as Column | SQL | SQLWrapper | SQL.Aliased,
					tsName: k,
				});
			}
		}

		if (colSelectionMode === false) {
			for (const [k, v] of Object.entries(columnContainer)) {
				if (columns[k] === false) continue;

				selectedColumns.push({
					column: v as Column | SQL | SQLWrapper | SQL.Aliased | Table,
					tsName: k,
				});
			}
		}

		return selectedColumns;
	};

	private buildColumns = (
		table: MySqlTable | MySqlView,
		selection: BuildRelationalQueryResult['selection'],
		params?: DBQueryConfig<'many'>,
	) =>
		params?.columns
			? (() => {
				const columnIdentifiers: SQL[] = [];

				const selectedColumns = this.getSelectedTableColumns(table, params.columns);

				for (const { column, tsName } of selectedColumns) {
					columnIdentifiers.push(this.buildRqbColumn(table, column, tsName));

					selection.push({
						key: tsName,
						field: column,
					});
				}

				return columnIdentifiers.length
					? sql.join(columnIdentifiers, sql`, `)
					: undefined;
			})()
			: this.unwrapAllColumns(table, selection);

	buildRelationalQuery(
		{
			tables,
			schema,
			tableNamesMap,
			table,
			tableConfig,
			queryConfig: config,
			relationWhere,
			mode,
			errorPath,
			depth,
			isNested,
			throughJoin,
		}: {
			tables: Record<string, MySqlTable | MySqlView>;
			schema: TablesRelationalConfig;
			tableNamesMap: Record<string, string>;
			table: MySqlTable | MySqlView;
			tableConfig: TableRelationalConfig;
			queryConfig?: DBQueryConfig<'many'> | true;
			relationWhere?: SQL;
			mode: 'first' | 'many';
			errorPath?: string;
			depth?: number;
			isNested?: boolean;
			throughJoin?: SQL;
		},
	): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const columns = this.buildColumns(table, selection, params);

		const where: SQL | undefined = (params?.where && relationWhere)
			? and(
				relationsFilterToSQL(table, params.where, tableConfig.relations, schema, tableNamesMap, this.casing),
				relationWhere,
			)
			: params?.where
			? relationsFilterToSQL(table, params.where, tableConfig.relations, schema, tableNamesMap, this.casing)
			: relationWhere;
		const order = params?.orderBy ? relationsOrderToSQL(table, params.orderBy) : undefined;
		const extras = params?.extras ? relationExtrasToSQL(table, params.extras) : undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = columns ? [columns] : [];

		const joins = params
			? (() => {
				const { with: joins } = params as WithContainer;
				if (!joins) return;

				const withEntries = Object.entries(joins).filter(([_, v]) => v);
				if (!withEntries.length) return;

				return sql.join(
					withEntries.map(([k, join]) => {
						selectionArr.push(sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`);

						// if (is(tableConfig.relations[k]!, AggregatedField)) {
						// 	const relation = tableConfig.relations[k]!;
						// 	relation.onTable(table);
						// 	const query = relation.getSQL();

						// 	selection.push({
						// 		key: k,
						// 		field: relation,
						// 	});

						// 	return sql` left join lateral (${query}) as ${sql.identifier(k)} on true`;
						// }

						const relation = tableConfig.relations[k]! as Relation;
						const isSingle = is(relation, One);
						const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`);
						const throughTable = relation.throughTable
							? aliasedTable(relation.throughTable, `tr${currentDepth}`)
							: undefined;
						const { filter, joinCondition } = relationToSQL(
							this.casing,
							relation,
							table,
							targetTable,
							throughTable,
						);

						const throughJoin = throughTable
							? sql` inner join ${getTableAsAliasSQL(throughTable)} on ${joinCondition!}`
							: undefined;

						const innerQuery = this.buildRelationalQuery({
							table: targetTable as MySqlTable,
							mode: isSingle ? 'first' : 'many',
							schema,
							queryConfig: join as DBQueryConfig,
							tableConfig: schema[tableNamesMap[getTableUniqueName(relation.targetTable)]!]!,
							tableNamesMap,
							tables,
							relationWhere: filter,
							errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
							depth: currentDepth + 1,
							isNested: true,
							throughJoin,
						});

						selection.push({
							field: targetTable,
							key: k,
							selection: innerQuery.selection,
							isArray: !isSingle,
							isOptional: ((relation as One<any, any>).optional ?? false)
								|| (join !== true && !!(join as Exclude<typeof join, boolean | undefined>).where),
						});

						const jsonColumns = sql.join(
							innerQuery.selection.map((s) => sql`${sql.raw(this.escapeString(s.key))}, ${sql.identifier(s.key)}`),
							sql`, `,
						);

						const joinQuery = sql` left join lateral(select ${sql`${
							isSingle
								? sql`json_object(${jsonColumns})`
								: sql`coalesce(json_arrayagg(json_object(${jsonColumns})), json_array())`
						} as ${sql.identifier('r')}`} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${
							sql.identifier(k)
						} on true`;

						return joinQuery;
					}),
				);
			})()
			: undefined;

		if (extras?.sql) selectionArr.push(extras.sql);
		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.tsName}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		// json_arrayagg() ignores order by clause otherwise
		if (isNested && order) {
			selectionArr.push(sql`row_number() over (order by ${order})`);
		}
		const selectionSet = sql.join(selectionArr, sql`, `);

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${sql`${joins}`.if(joins)}${
			sql` where ${where}`.if(where)
		}${sql` order by ${order}`.if(order)}${sql` limit ${limit}`.if(limit !== undefined)}${
			sql` offset ${offset}`.if(offset !== undefined)
		}`;

		return {
			sql: query,
			selection,
		};
	}
}
