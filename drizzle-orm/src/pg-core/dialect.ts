import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationMeta } from '~/migrator.ts';
import { PgColumn, PgDate, PgJson, PgJsonb, PgNumeric, PgTime, PgTimestamp, PgUUID } from '~/pg-core/columns/index.ts';
import type {
	PgDeleteConfig,
	PgInsertConfig,
	PgSelectJoinConfig,
	PgUpdateConfig,
} from '~/pg-core/query-builders/index.ts';
import type { PgSelectConfig, SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import { PgTable } from '~/pg-core/table.ts';
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
import { and, eq, View } from '~/sql/index.ts';
import {
	type DriverValueEncoder,
	type Name,
	Param,
	type QueryTypingsValue,
	type QueryWithTypings,
	SQL,
	sql,
	type SQLChunk,
} from '~/sql/sql.ts';
import { Subquery, SubqueryConfig } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { PgSession } from './session.ts';
import { PgViewBase } from './view-base.ts';
import type { PgMaterializedView } from './view.ts';

export class PgDialect {
	static readonly [entityKind]: string = 'PgDialect';

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

	buildUpdateSet(table: PgTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter((colName) =>
			set[colName] !== undefined || tableColumns[colName]?.onUpdateFn !== undefined
		);

		const setSize = columnNames.length;
		return sql.join(columnNames.flatMap((colName, i) => {
			const col = tableColumns[colName]!;

			const value = set[colName] ?? sql.param(col.onUpdateFn!(), col);
			const res = sql`${sql.identifier(col.name)} = ${value}`;

			if (i < setSize - 1) {
				return [res, sql.raw(', ')];
			}
			return [res];
		}));
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

				if (is(field, SQL.Aliased) && field.isSelectionField) {
					chunk.push(sql.identifier(field.fieldAlias));
				} else if (is(field, SQL.Aliased) || is(field, SQL)) {
					const query = is(field, SQL.Aliased) ? field.sql : field;

					if (isSingleTable) {
						chunk.push(
							new SQL(
								query.queryChunks.map((c) => {
									if (is(c, PgColumn)) {
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
		}: PgSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<PgColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table[SubqueryConfig].alias
						: is(table, PgViewBase)
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

		let distinctSql: SQL | undefined;
		if (distinct) {
			distinctSql = distinct === true ? sql` distinct` : sql` distinct on (${sql.join(distinct.on, sql`, `)})`;
		}

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = (() => {
			if (is(table, Table) && table[Table.Symbol.OriginalName] !== table[Table.Symbol.Name]) {
				let fullName = sql`${sql.identifier(table[Table.Symbol.OriginalName])}`;
				if (table[Table.Symbol.Schema]) {
					fullName = sql`${sql.identifier(table[Table.Symbol.Schema]!)}.${fullName}`;
				}
				return sql`${fullName} ${sql.identifier(table[Table.Symbol.Name])}`;
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

				if (is(table, PgTable)) {
					const tableName = table[PgTable.Symbol.Name];
					const tableSchema = table[PgTable.Symbol.Schema];
					const origTableName = table[PgTable.Symbol.OriginalName];
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

		const lockingClauseSql = sql.empty();
		if (lockingClause) {
			const clauseSql = sql` for ${sql.raw(lockingClause.strength)}`;
			if (lockingClause.config.of) {
				clauseSql.append(
					sql` of ${
						sql.join(
							Array.isArray(lockingClause.config.of) ? lockingClause.config.of : [lockingClause.config.of],
							sql`, `,
						)
					}`,
				);
			}
			if (lockingClause.config.noWait) {
				clauseSql.append(sql` no wait`);
			} else if (lockingClause.config.skipLocked) {
				clauseSql.append(sql` skip locked`);
			}
			lockingClauseSql.append(clauseSql);
		}
		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClauseSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(leftSelect: SQL, setOperators: PgSelectConfig['setOperators']): SQL {
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
	}: { leftSelect: SQL; setOperator: PgSelectConfig['setOperators'][number] }): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, PgColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, PgColumn)) {
							singleOrderBy.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${singleOrderBy}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)} `;
		}

		const limitSql = limit ? sql` limit ${limit}` : undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({ table, values, onConflict, returning }: PgInsertConfig): SQL {
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, PgColumn][] = Object.entries(columns);

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
					} else if (!col.default && col.onUpdateFn !== undefined) {
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
			is(encoder, PgJsonb) || is(encoder, PgJson)
		) {
			return 'json';
		} else if (is(encoder, PgNumeric)) {
			return 'decimal';
		} else if (is(encoder, PgTime)) {
			return 'time';
		} else if (is(encoder, PgTimestamp)) {
			return 'timestamp';
		} else if (is(encoder, PgDate)) {
			return 'date';
		} else if (is(encoder, PgUUID)) {
			return 'uuid';
		} else {
			return 'none';
		}
	}

	sqlToQuery(sql: SQL): QueryWithTypings {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			prepareTyping: this.prepareTyping,
		});
	}

	// buildRelationalQueryWithPK({
	// 	fullSchema,
	// 	schema,
	// 	tableNamesMap,
	// 	table,
	// 	tableConfig,
	// 	queryConfig: config,
	// 	tableAlias,
	// 	isRoot = false,
	// 	joinOn,
	// }: {
	// 	fullSchema: Record<string, unknown>;
	// 	schema: TablesRelationalConfig;
	// 	tableNamesMap: Record<string, string>;
	// 	table: PgTable;
	// 	tableConfig: TableRelationalConfig;
	// 	queryConfig: true | DBQueryConfig<'many', true>;
	// 	tableAlias: string;
	// 	isRoot?: boolean;
	// 	joinOn?: SQL;
	// }): BuildRelationalQueryResult<PgTable, PgColumn> {
	// 	// For { "<relation>": true }, return a table with selection of all columns
	// 	if (config === true) {
	// 		const selectionEntries = Object.entries(tableConfig.columns);
	// 		const selection: BuildRelationalQueryResult<PgTable, PgColumn>['selection'] = selectionEntries.map((
	// 			[key, value],
	// 		) => ({
	// 			dbKey: value.name,
	// 			tsKey: key,
	// 			field: value as PgColumn,
	// 			relationTableTsKey: undefined,
	// 			isJson: false,
	// 			selection: [],
	// 		}));

	// 		return {
	// 			tableTsKey: tableConfig.tsName,
	// 			sql: table,
	// 			selection,
	// 		};
	// 	}

	// 	// let selection: BuildRelationalQueryResult<PgTable, PgColumn>['selection'] = [];
	// 	// let selectionForBuild = selection;

	// 	const aliasedColumns = Object.fromEntries(
	// 		Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
	// 	);

	// 	const aliasedRelations = Object.fromEntries(
	// 		Object.entries(tableConfig.relations).map(([key, value]) => [key, aliasedRelation(value, tableAlias)]),
	// 	);

	// 	const aliasedFields = Object.assign({}, aliasedColumns, aliasedRelations);

	// 	let where, hasUserDefinedWhere;
	// 	if (config.where) {
	// 		const whereSql = typeof config.where === 'function' ? config.where(aliasedFields, operators) : config.where;
	// 		where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
	// 		hasUserDefinedWhere = !!where;
	// 	}
	// 	where = and(joinOn, where);

	// 	// const fieldsSelection: { tsKey: string; value: PgColumn | SQL.Aliased; isExtra?: boolean }[] = [];
	// 	let joins: Join[] = [];
	// 	let selectedColumns: string[] = [];

	// 	// Figure out which columns to select
	// 	if (config.columns) {
	// 		let isIncludeMode = false;

	// 		for (const [field, value] of Object.entries(config.columns)) {
	// 			if (value === undefined) {
	// 				continue;
	// 			}

	// 			if (field in tableConfig.columns) {
	// 				if (!isIncludeMode && value === true) {
	// 					isIncludeMode = true;
	// 				}
	// 				selectedColumns.push(field);
	// 			}
	// 		}

	// 		if (selectedColumns.length > 0) {
	// 			selectedColumns = isIncludeMode
	// 				? selectedColumns.filter((c) => config.columns?.[c] === true)
	// 				: Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
	// 		}
	// 	} else {
	// 		// Select all columns if selection is not specified
	// 		selectedColumns = Object.keys(tableConfig.columns);
	// 	}

	// 	// for (const field of selectedColumns) {
	// 	// 	const column = tableConfig.columns[field]! as PgColumn;
	// 	// 	fieldsSelection.push({ tsKey: field, value: column });
	// 	// }

	// 	let initiallySelectedRelations: {
	// 		tsKey: string;
	// 		queryConfig: true | DBQueryConfig<'many', false>;
	// 		relation: Relation;
	// 	}[] = [];

	// 	// let selectedRelations: BuildRelationalQueryResult<PgTable, PgColumn>['selection'] = [];

	// 	// Figure out which relations to select
	// 	if (config.with) {
	// 		initiallySelectedRelations = Object.entries(config.with)
	// 			.filter((entry): entry is [typeof entry[0], NonNullable<typeof entry[1]>] => !!entry[1])
	// 			.map(([tsKey, queryConfig]) => ({ tsKey, queryConfig, relation: tableConfig.relations[tsKey]! }));
	// 	}

	// 	const manyRelations = initiallySelectedRelations.filter((r) =>
	// 		is(r.relation, Many)
	// 		&& (schema[tableNamesMap[r.relation.referencedTable[Table.Symbol.Name]]!]?.primaryKey.length ?? 0) > 0
	// 	);
	// 	// If this is the last Many relation (or there are no Many relations), we are on the innermost subquery level
	// 	const isInnermostQuery = manyRelations.length < 2;

	// 	const selectedExtras: {
	// 		tsKey: string;
	// 		value: SQL.Aliased;
	// 	}[] = [];

	// 	// Figure out which extras to select
	// 	if (isInnermostQuery && config.extras) {
	// 		const extras = typeof config.extras === 'function'
	// 			? config.extras(aliasedFields, { sql })
	// 			: config.extras;
	// 		for (const [tsKey, value] of Object.entries(extras)) {
	// 			selectedExtras.push({
	// 				tsKey,
	// 				value: mapColumnsInAliasedSQLToAlias(value, tableAlias),
	// 			});
	// 		}
	// 	}

	// 	// Transform `fieldsSelection` into `selection`
	// 	// `fieldsSelection` shouldn't be used after this point
	// 	// for (const { tsKey, value, isExtra } of fieldsSelection) {
	// 	// 	selection.push({
	// 	// 		dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey]!.name,
	// 	// 		tsKey,
	// 	// 		field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
	// 	// 		relationTableTsKey: undefined,
	// 	// 		isJson: false,
	// 	// 		isExtra,
	// 	// 		selection: [],
	// 	// 	});
	// 	// }

	// 	let orderByOrig = typeof config.orderBy === 'function'
	// 		? config.orderBy(aliasedFields, orderByOperators)
	// 		: config.orderBy ?? [];
	// 	if (!Array.isArray(orderByOrig)) {
	// 		orderByOrig = [orderByOrig];
	// 	}
	// 	const orderBy = orderByOrig.map((orderByValue) => {
	// 		if (is(orderByValue, Column)) {
	// 			return aliasedTableColumn(orderByValue, tableAlias) as PgColumn;
	// 		}
	// 		return mapColumnsInSQLToAlias(orderByValue, tableAlias);
	// 	});

	// 	const limit = isInnermostQuery ? config.limit : undefined;
	// 	const offset = isInnermostQuery ? config.offset : undefined;

	// 	// For non-root queries without additional config except columns, return a table with selection
	// 	if (
	// 		!isRoot
	// 		&& initiallySelectedRelations.length === 0
	// 		&& selectedExtras.length === 0
	// 		&& !where
	// 		&& orderBy.length === 0
	// 		&& limit === undefined
	// 		&& offset === undefined
	// 	) {
	// 		return {
	// 			tableTsKey: tableConfig.tsName,
	// 			sql: table,
	// 			selection: selectedColumns.map((key) => ({
	// 				dbKey: tableConfig.columns[key]!.name,
	// 				tsKey: key,
	// 				field: tableConfig.columns[key] as PgColumn,
	// 				relationTableTsKey: undefined,
	// 				isJson: false,
	// 				selection: [],
	// 			})),
	// 		};
	// 	}

	// 	const selectedRelationsWithoutPK:

	// 	// Process all relations without primary keys, because they need to be joined differently and will all be on the same query level
	// 	for (
	// 		const {
	// 			tsKey: selectedRelationTsKey,
	// 			queryConfig: selectedRelationConfigValue,
	// 			relation,
	// 		} of initiallySelectedRelations
	// 	) {
	// 		const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
	// 		const relationTableName = relation.referencedTable[Table.Symbol.Name];
	// 		const relationTableTsName = tableNamesMap[relationTableName]!;
	// 		const relationTable = schema[relationTableTsName]!;

	// 		if (relationTable.primaryKey.length > 0) {
	// 			continue;
	// 		}

	// 		const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
	// 		const joinOn = and(
	// 			...normalizedRelation.fields.map((field, i) =>
	// 				eq(
	// 					aliasedTableColumn(normalizedRelation.references[i]!, relationTableAlias),
	// 					aliasedTableColumn(field, tableAlias),
	// 				)
	// 			),
	// 		);
	// 		const builtRelation = this.buildRelationalQueryWithoutPK({
	// 			fullSchema,
	// 			schema,
	// 			tableNamesMap,
	// 			table: fullSchema[relationTableTsName] as PgTable,
	// 			tableConfig: schema[relationTableTsName]!,
	// 			queryConfig: selectedRelationConfigValue,
	// 			tableAlias: relationTableAlias,
	// 			joinOn,
	// 			nestedQueryRelation: relation,
	// 		});
	// 		const field = sql`${sql.identifier(relationTableAlias)}.${sql.identifier('data')}`.as(selectedRelationTsKey);
	// 		joins.push({
	// 			on: sql`true`,
	// 			table: new Subquery(builtRelation.sql as SQL, {}, relationTableAlias),
	// 			alias: relationTableAlias,
	// 			joinType: 'left',
	// 			lateral: true,
	// 		});
	// 		selectedRelations.push({
	// 			dbKey: selectedRelationTsKey,
	// 			tsKey: selectedRelationTsKey,
	// 			field,
	// 			relationTableTsKey: relationTableTsName,
	// 			isJson: true,
	// 			selection: builtRelation.selection,
	// 		});
	// 	}

	// 	const oneRelations = initiallySelectedRelations.filter((r): r is typeof r & { relation: One } =>
	// 		is(r.relation, One)
	// 	);

	// 	// Process all One relations with PKs, because they can all be joined on the same level
	// 	for (
	// 		const {
	// 			tsKey: selectedRelationTsKey,
	// 			queryConfig: selectedRelationConfigValue,
	// 			relation,
	// 		} of oneRelations
	// 	) {
	// 		const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
	// 		const relationTableName = relation.referencedTable[Table.Symbol.Name];
	// 		const relationTableTsName = tableNamesMap[relationTableName]!;
	// 		const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
	// 		const relationTable = schema[relationTableTsName]!;

	// 		if (relationTable.primaryKey.length === 0) {
	// 			continue;
	// 		}

	// 		const joinOn = and(
	// 			...normalizedRelation.fields.map((field, i) =>
	// 				eq(
	// 					aliasedTableColumn(normalizedRelation.references[i]!, relationTableAlias),
	// 					aliasedTableColumn(field, tableAlias),
	// 				)
	// 			),
	// 		);
	// 		const builtRelation = this.buildRelationalQueryWithPK({
	// 			fullSchema,
	// 			schema,
	// 			tableNamesMap,
	// 			table: fullSchema[relationTableTsName] as PgTable,
	// 			tableConfig: schema[relationTableTsName]!,
	// 			queryConfig: selectedRelationConfigValue,
	// 			tableAlias: relationTableAlias,
	// 			joinOn,
	// 		});
	// 		const field = sql`case when ${sql.identifier(relationTableAlias)} is null then null else json_build_array(${
	// 			sql.join(
	// 				builtRelation.selection.map(({ field }) =>
	// 					is(field, SQL.Aliased)
	// 						? sql`${sql.identifier(relationTableAlias)}.${sql.identifier(field.fieldAlias)}`
	// 						: is(field, Column)
	// 						? aliasedTableColumn(field, relationTableAlias)
	// 						: field
	// 				),
	// 				sql`, `,
	// 			)
	// 		}) end`.as(selectedRelationTsKey);
	// 		const isLateralJoin = is(builtRelation.sql, SQL);
	// 		joins.push({
	// 			on: isLateralJoin ? sql`true` : joinOn,
	// 			table: is(builtRelation.sql, SQL)
	// 				? new Subquery(builtRelation.sql, {}, relationTableAlias)
	// 				: aliasedTable(builtRelation.sql, relationTableAlias),
	// 			alias: relationTableAlias,
	// 			joinType: 'left',
	// 			lateral: is(builtRelation.sql, SQL),
	// 		});
	// 		selectedRelations.push({
	// 			dbKey: selectedRelationTsKey,
	// 			tsKey: selectedRelationTsKey,
	// 			field,
	// 			relationTableTsKey: relationTableTsName,
	// 			isJson: true,
	// 			selection: builtRelation.selection,
	// 		});
	// 	}

	// 	let distinct: PgSelectConfig['distinct'];
	// 	let tableFrom: PgTable | Subquery = table;

	// 	// Process first Many relation - each one requires a nested subquery
	// 	const manyRelation = manyRelations[0];
	// 	if (manyRelation) {
	// 		const {
	// 			tsKey: selectedRelationTsKey,
	// 			queryConfig: selectedRelationQueryConfig,
	// 			relation,
	// 		} = manyRelation;

	// 		distinct = {
	// 			on: tableConfig.primaryKey.map((c) => aliasedTableColumn(c as PgColumn, tableAlias)),
	// 		};

	// 		const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
	// 		const relationTableName = relation.referencedTable[Table.Symbol.Name];
	// 		const relationTableTsName = tableNamesMap[relationTableName]!;
	// 		const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
	// 		const joinOn = and(
	// 			...normalizedRelation.fields.map((field, i) =>
	// 				eq(
	// 					aliasedTableColumn(normalizedRelation.references[i]!, relationTableAlias),
	// 					aliasedTableColumn(field, tableAlias),
	// 				)
	// 			),
	// 		);

	// 		const builtRelationJoin = this.buildRelationalQueryWithPK({
	// 			fullSchema,
	// 			schema,
	// 			tableNamesMap,
	// 			table: fullSchema[relationTableTsName] as PgTable,
	// 			tableConfig: schema[relationTableTsName]!,
	// 			queryConfig: selectedRelationQueryConfig,
	// 			tableAlias: relationTableAlias,
	// 			joinOn,
	// 		});

	// 		const builtRelationSelectionField = sql`case when ${
	// 			sql.identifier(relationTableAlias)
	// 		} is null then '[]' else json_agg(json_build_array(${
	// 			sql.join(
	// 				builtRelationJoin.selection.map(({ field }) =>
	// 					is(field, SQL.Aliased)
	// 						? sql`${sql.identifier(relationTableAlias)}.${sql.identifier(field.fieldAlias)}`
	// 						: is(field, Column)
	// 						? aliasedTableColumn(field, relationTableAlias)
	// 						: field
	// 				),
	// 				sql`, `,
	// 			)
	// 		})) over (partition by ${sql.join(distinct.on, sql`, `)}) end`.as(selectedRelationTsKey);
	// 		const isLateralJoin = is(builtRelationJoin.sql, SQL);
	// 		joins.push({
	// 			on: isLateralJoin ? sql`true` : joinOn,
	// 			table: isLateralJoin
	// 				? new Subquery(builtRelationJoin.sql as SQL, {}, relationTableAlias)
	// 				: aliasedTable(builtRelationJoin.sql as PgTable, relationTableAlias),
	// 			alias: relationTableAlias,
	// 			joinType: 'left',
	// 			lateral: isLateralJoin,
	// 		});

	// 		// Build the "from" subquery with the remaining Many relations
	// 		const builtTableFrom = this.buildRelationalQueryWithPK({
	// 			fullSchema,
	// 			schema,
	// 			tableNamesMap,
	// 			table,
	// 			tableConfig,
	// 			queryConfig: {
	// 				...config,
	// 				where: undefined,
	// 				orderBy: undefined,
	// 				limit: undefined,
	// 				offset: undefined,
	// 				with: manyRelations.slice(1).reduce<NonNullable<typeof config['with']>>(
	// 					(result, { tsKey, queryConfig: configValue }) => {
	// 						result[tsKey] = configValue;
	// 						return result;
	// 					},
	// 					{},
	// 				),
	// 			},
	// 			tableAlias,
	// 		});

	// 		selectedRelations.push({
	// 			dbKey: selectedRelationTsKey,
	// 			tsKey: selectedRelationTsKey,
	// 			field: builtRelationSelectionField,
	// 			relationTableTsKey: relationTableTsName,
	// 			isJson: true,
	// 			selection: builtRelationJoin.selection,
	// 		});

	// 		// selection = builtTableFrom.selection.map((item) =>
	// 		// 	is(item.field, SQL.Aliased)
	// 		// 		? { ...item, field: sql`${sql.identifier(tableAlias)}.${sql.identifier(item.field.fieldAlias)}` }
	// 		// 		: item
	// 		// );
	// 		// selectionForBuild = [{
	// 		// 	dbKey: '*',
	// 		// 	tsKey: '*',
	// 		// 	field: sql`${sql.identifier(tableAlias)}.*`,
	// 		// 	selection: [],
	// 		// 	isJson: false,
	// 		// 	relationTableTsKey: undefined,
	// 		// }];
	// 		// const newSelectionItem: (typeof selection)[number] = {
	// 		// 	dbKey: selectedRelationTsKey,
	// 		// 	tsKey: selectedRelationTsKey,
	// 		// 	field,
	// 		// 	relationTableTsKey: relationTableTsName,
	// 		// 	isJson: true,
	// 		// 	selection: builtRelationJoin.selection,
	// 		// };
	// 		// selection.push(newSelectionItem);
	// 		// selectionForBuild.push(newSelectionItem);

	// 		tableFrom = is(builtTableFrom.sql, PgTable)
	// 			? builtTableFrom.sql
	// 			: new Subquery(builtTableFrom.sql, {}, tableAlias);
	// 	}

	// 	if (selectedColumns.length === 0 && selectedRelations.length === 0 && selectedExtras.length === 0) {
	// 		throw new DrizzleError(`No fields selected for table "${tableConfig.tsName}" ("${tableAlias}")`);
	// 	}

	// 	let selection: BuildRelationalQueryResult<PgTable, PgColumn>['selection'];

	// 	function prepareSelectedColumns() {
	// 		return selectedColumns.map((key) => ({
	// 			dbKey: tableConfig.columns[key]!.name,
	// 			tsKey: key,
	// 			field: tableConfig.columns[key] as PgColumn,
	// 			relationTableTsKey: undefined,
	// 			isJson: false,
	// 			selection: [],
	// 		}));
	// 	}

	// 	function prepareSelectedExtras() {
	// 		return selectedExtras.map((item) => ({
	// 			dbKey: item.value.fieldAlias,
	// 			tsKey: item.tsKey,
	// 			field: item.value,
	// 			relationTableTsKey: undefined,
	// 			isJson: false,
	// 			selection: [],
	// 		}));
	// 	}

	// 	if (isRoot) {
	// 		selection = [
	// 			...prepareSelectedColumns(),
	// 			...prepareSelectedExtras(),
	// 		];
	// 	}

	// 	if (hasUserDefinedWhere || orderBy.length > 0) {
	// 		tableFrom = new Subquery(
	// 			this.buildSelectQuery({
	// 				table: is(tableFrom, PgTable) ? aliasedTable(tableFrom, tableAlias) : tableFrom,
	// 				fields: {},
	// 				fieldsFlat: selectionForBuild.map(({ field }) => ({
	// 					path: [],
	// 					field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
	// 				})),
	// 				joins,
	// 				distinct,
	// 			}),
	// 			{},
	// 			tableAlias,
	// 		);
	// 		selectionForBuild = selection.map((item) =>
	// 			is(item.field, SQL.Aliased)
	// 				? { ...item, field: sql`${sql.identifier(tableAlias)}.${sql.identifier(item.field.fieldAlias)}` }
	// 				: item
	// 		);
	// 		joins = [];
	// 		distinct = undefined;
	// 	}

	// 	const result = this.buildSelectQuery({
	// 		table: is(tableFrom, PgTable) ? aliasedTable(tableFrom, tableAlias) : tableFrom,
	// 		fields: {},
	// 		fieldsFlat: selectionForBuild.map(({ field }) => ({
	// 			path: [],
	// 			field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field,
	// 		})),
	// 		where,
	// 		limit,
	// 		offset,
	// 		joins,
	// 		orderBy,
	// 		distinct,
	// 	});

	// 	return {
	// 		tableTsKey: tableConfig.tsName,
	// 		sql: result,
	// 		selection,
	// 	};
	// }

	buildRelationalQueryWithoutPK({
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
		table: PgTable;
		tableConfig: TableRelationalConfig;
		queryConfig: true | DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: Relation;
		joinOn?: SQL;
	}): BuildRelationalQueryResult<PgTable, PgColumn> {
		let selection: BuildRelationalQueryResult<PgTable, PgColumn>['selection'] = [];
		let limit, offset, orderBy: NonNullable<PgSelectConfig['orderBy']> = [], where;
		const joins: PgSelectJoinConfig[] = [];

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map((
				[key, value],
			) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as PgColumn, tableAlias),
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

			const fieldsSelection: { tsKey: string; value: PgColumn | SQL.Aliased }[] = [];
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
				const column = tableConfig.columns[field]! as PgColumn;
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
					return aliasedTableColumn(orderByValue, tableAlias) as PgColumn;
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
				const builtRelation = this.buildRelationalQueryWithoutPK({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as PgTable,
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
			let field = sql`json_build_array(${
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
				field = sql`coalesce(json_agg(${field}${
					orderBy.length > 0 ? sql` order by ${sql.join(orderBy, sql`, `)}` : undefined
				}), '[]'::json)`;
				// orderBy = [];
			}
			const nestedSelection = [{
				dbKey: 'data',
				tsKey: 'data',
				field: field.as('data'),
				isJson: true,
				relationTableTsKey: tableConfig.tsName,
				selection,
			}];

			const needsSubquery = limit !== undefined || offset !== undefined || orderBy.length > 0;

			if (needsSubquery) {
				result = this.buildSelectQuery({
					table: aliasedTable(table, tableAlias),
					fields: {},
					fieldsFlat: [{
						path: [],
						field: sql.raw('*'),
					}],
					where,
					limit,
					offset,
					orderBy,
					setOperators: [],
				});

				where = undefined;
				limit = undefined;
				offset = undefined;
				orderBy = [];
			} else {
				result = aliasedTable(table, tableAlias);
			}

			result = this.buildSelectQuery({
				table: is(result, PgTable) ? result : new Subquery(result, {}, tableAlias),
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
}
