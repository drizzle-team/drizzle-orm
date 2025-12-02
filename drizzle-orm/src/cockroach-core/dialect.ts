import * as V1 from '~/_relations.ts';
import {
	aliasedTable,
	aliasedTableColumn,
	getOriginalColumnFromAlias,
	mapColumnsInAliasedSQLToAlias,
	mapColumnsInSQLToAlias,
} from '~/alias.ts';
import { CasingCache } from '~/casing.ts';
import { CockroachColumn } from '~/cockroach-core/columns/index.ts';
import type {
	AnyCockroachSelectQueryBuilder,
	CockroachDeleteConfig,
	CockroachInsertConfig,
	CockroachSelectJoinConfig,
	CockroachUpdateConfig,
} from '~/cockroach-core/query-builders/index.ts';
import type { CockroachSelectConfig, SelectedFieldsOrdered } from '~/cockroach-core/query-builders/select.types.ts';
import { CockroachTable } from '~/cockroach-core/table.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { and, eq, View } from '~/sql/index.ts';
import { type Name, Param, type QueryWithTypings, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, getTableUniqueName, Table } from '~/table.ts';
import { type Casing, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { CockroachSession } from './session.ts';
import { CockroachViewBase } from './view-base.ts';
import type { CockroachMaterializedView } from './view.ts';

export interface CockroachDialectConfig {
	casing?: Casing;
}

export class CockroachDialect {
	static readonly [entityKind]: string = 'CockroachDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: CockroachDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	async migrate(
		migrations: MigrationMeta[],
		session: CockroachSession,
		config: string | MigrationConfig,
	): Promise<void | MigratorInitFailResponse> {
		const migrationsTable = typeof config === 'string'
			? '__drizzle_migrations'
			: config.migrationsTable ?? '__drizzle_migrations';
		const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id INT GENERATED ALWAYS AS IDENTITY,
				hash text NOT NULL,
				created_at bigint
			)
		`;
		await session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
		await session.execute(migrationTableCreate);

		const dbMigrations = await session.all<{ id: number; hash: string; created_at: string }>(
			sql`select id, hash, created_at from ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} order by created_at desc limit 1`,
		);

		if (typeof config === 'object' && config.init) {
			if (dbMigrations.length) {
				return { exitCode: 'databaseMigrations' as const };
			}

			if (migrations.length > 1) {
				return { exitCode: 'localMigrations' as const };
			}

			const [migration] = migrations;

			if (!migration) return;

			await session.execute(
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(migrationsTable)
				} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
			);

			return;
		}

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
						sql`insert into ${sql.identifier(migrationsSchema)}.${
							sql.identifier(migrationsTable)
						} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
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

	buildDeleteQuery({ table, where, returning, withList }: CockroachDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}delete from ${table}${whereSql}${returningSql}`;
	}

	buildUpdateSet(table: CockroachTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter((colName) =>
			set[colName] !== undefined || tableColumns[colName]?.onUpdateFn !== undefined
		);

		const setSize = columnNames.length;
		return sql.join(columnNames.flatMap((colName, i) => {
			const col = tableColumns[colName]!;

			const onUpdateFnResult = col.onUpdateFn?.();
			const value = set[colName] ?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
			const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;

			if (i < setSize - 1) {
				return [res, sql.raw(', ')];
			}
			return [res];
		}));
	}

	buildUpdateQuery({ table, set, where, returning, withList, from, joins }: CockroachUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const tableName = table[CockroachTable.Symbol.Name];
		const tableSchema = table[CockroachTable.Symbol.Schema];
		const origTableName = table[CockroachTable.Symbol.OriginalName];
		const alias = tableName === origTableName ? undefined : tableName;
		const tableSql = sql`${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
			sql.identifier(origTableName)
		}${alias && sql` ${sql.identifier(alias)}`}`;

		const setSql = this.buildUpdateSet(table, set);

		const fromSql = from && sql.join([sql.raw(' from '), this.buildFromTable(from)]);

		const joinsSql = this.buildJoins(joins);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: !from })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`${withSql}update ${tableSql} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}`;
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
									if (is(c, CockroachColumn)) {
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
						chunk.push(
							field.isAlias
								? sql`${sql.identifier(this.casing.getColumnCasing(getOriginalColumnFromAlias(field)))} as ${field}`
								: sql.identifier(this.casing.getColumnCasing(field)),
						);
					} else {
						chunk.push(field.isAlias ? sql`${getOriginalColumnFromAlias(field)} as ${field}` : field);
					}
				} else if (is(field, Subquery)) {
					const entries = Object.entries(field._.selectedFields) as [string, SQL.Aliased | Column | SQL][];

					if (entries.length === 1) {
						const entry = entries[0]![1];

						const fieldDecoder = is(entry, SQL)
							? entry.decoder
							: is(entry, Column)
							? { mapFromDriverValue: (v: any) => entry.mapFromDriverValue(v) }
							: entry.sql.decoder;

						if (fieldDecoder) {
							field._.sql.decoder = fieldDecoder;
						}
					}
					chunk.push(field);
				}

				if (i < columnsLen - 1) {
					chunk.push(sql`, `);
				}

				return chunk;
			});

		return sql.join(chunks);
	}

	private buildJoins(joins: CockroachSelectJoinConfig[] | undefined): SQL | undefined {
		if (!joins || joins.length === 0) {
			return undefined;
		}

		const joinsArray: SQL[] = [];

		for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) {
				joinsArray.push(sql` `);
			}
			const table = joinMeta.table;
			const lateralSql = joinMeta.lateral ? sql` lateral` : undefined;
			const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

			if (is(table, CockroachTable)) {
				const tableName = table[CockroachTable.Symbol.Name];
				const tableSchema = table[CockroachTable.Symbol.Schema];
				const origTableName = table[CockroachTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
						tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
					}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
				);
			} else if (is(table, View)) {
				const viewName = table[ViewBaseConfig].name;
				const viewSchema = table[ViewBaseConfig].schema;
				const origViewName = table[ViewBaseConfig].originalName;
				const alias = viewName === origViewName ? undefined : joinMeta.alias;
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
						viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined
					}${sql.identifier(origViewName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
				);
			} else {
				joinsArray.push(
					sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${table}${onSql}`,
				);
			}
			if (index < joins.length - 1) {
				joinsArray.push(sql` `);
			}
		}

		return sql.join(joinsArray);
	}

	private buildFromTable(
		table: SQL | Subquery | CockroachViewBase | CockroachTable | undefined,
	): SQL | Subquery | CockroachViewBase | CockroachTable | undefined {
		if (is(table, Table) && table[Table.Symbol.IsAlias]) {
			let fullName = sql`${sql.identifier(table[Table.Symbol.OriginalName])}`;
			if (table[Table.Symbol.Schema]) {
				fullName = sql`${sql.identifier(table[Table.Symbol.Schema]!)}.${fullName}`;
			}
			return sql`${fullName} ${sql.identifier(table[Table.Symbol.Name])}`;
		}

		return table;
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
		}: CockroachSelectConfig,
	): SQL {
		const fieldsList = fieldsFlat ?? orderSelectedFields<CockroachColumn>(fields);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						: is(table, CockroachViewBase)
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

		let distinctSql: SQL | undefined;
		if (distinct) {
			distinctSql = distinct === true ? sql` distinct` : sql` distinct on (${sql.join(distinct.on, sql`, `)})`;
		}

		const selection = this.buildSelection(fieldsList, { isSingleTable });

		const tableSql = this.buildFromTable(table);

		const joinsSql = this.buildJoins(joins);

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

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

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
				clauseSql.append(sql` nowait`);
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

	buildSetOperations(leftSelect: SQL, setOperators: CockroachSelectConfig['setOperators']): SQL {
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
	}: { leftSelect: SQL; setOperator: CockroachSelectConfig['setOperators'][number] }): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, CockroachColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, CockroachColumn)) {
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

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery(
		{ table, values: valuesOrSelect, onConflict, returning, withList, select }: CockroachInsertConfig,
	): SQL {
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, CockroachColumn> = table[Table.Symbol.Columns];

		const colEntries: [string, CockroachColumn][] = Object.entries(columns).filter(([_, col]) =>
			!col.shouldDisableInsert()
		);

		const insertOrder = colEntries.map(
			([, column]) => sql.identifier(this.casing.getColumnCasing(column)),
		);

		if (select) {
			const select = valuesOrSelect as AnyCockroachSelectQueryBuilder | SQL;

			if (is(select, SQL)) {
				valuesSqlList.push(select);
			} else {
				valuesSqlList.push(select.getSQL());
			}
		} else {
			const values = valuesOrSelect as Record<string, Param | SQL>[];
			valuesSqlList.push(sql.raw('values '));

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
		}

		const withSql = this.buildWithCTE(withList);

		const valuesSql = sql.join(valuesSqlList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const onConflictSql = onConflict ? sql` on conflict ${onConflict}` : undefined;

		return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
	}

	buildRefreshMaterializedViewQuery(
		{ view, concurrently, withNoData }: {
			view: CockroachMaterializedView;
			concurrently?: boolean;
			withNoData?: boolean;
		},
	): SQL {
		const concurrentlySql = concurrently ? sql` concurrently` : undefined;
		const withNoDataSql = withNoData ? sql` with no data` : undefined;

		return sql`refresh materialized view${concurrentlySql} ${view}${withNoDataSql}`;
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
	// 	table: CockroachTable;
	// 	tableConfig: TableRelationalConfig;
	// 	queryConfig: true | DBQueryConfig<'many', true>;
	// 	tableAlias: string;
	// 	isRoot?: boolean;
	// 	joinOn?: SQL;
	// }): BuildRelationalQueryResult<CockroachTable, CockroachColumn> {
	// 	// For { "<relation>": true }, return a table with selection of all columns
	// 	if (config === true) {
	// 		const selectionEntries = Object.entries(tableConfig.columns);
	// 		const selection: BuildRelationalQueryResult<CockroachTable, CockroachColumn>['selection'] = selectionEntries.map((
	// 			[key, value],
	// 		) => ({
	// 			dbKey: value.name,
	// 			tsKey: key,
	// 			field: value as CockroachColumn,
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

	// 	// let selection: BuildRelationalQueryResult<CockroachTable, CockroachColumn>['selection'] = [];
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

	// 	// const fieldsSelection: { tsKey: string; value: CockroachColumn | SQL.Aliased; isExtra?: boolean }[] = [];
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
	// 	// 	const column = tableConfig.columns[field]! as CockroachColumn;
	// 	// 	fieldsSelection.push({ tsKey: field, value: column });
	// 	// }

	// 	let initiallySelectedRelations: {
	// 		tsKey: string;
	// 		queryConfig: true | DBQueryConfig<'many', false>;
	// 		relation: Relation;
	// 	}[] = [];

	// 	// let selectedRelations: BuildRelationalQueryResult<CockroachTable, CockroachColumn>['selection'] = [];

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
	// 			return aliasedTableColumn(orderByValue, tableAlias) as CockroachColumn;
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
	// 				field: tableConfig.columns[key] as CockroachColumn,
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
	// 			table: fullSchema[relationTableTsName] as CockroachTable,
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
	// 			table: fullSchema[relationTableTsName] as CockroachTable,
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

	// 	let distinct: CockroachSelectConfig['distinct'];
	// 	let tableFrom: CockroachTable | Subquery = table;

	// 	// Process first Many relation - each one requires a nested subquery
	// 	const manyRelation = manyRelations[0];
	// 	if (manyRelation) {
	// 		const {
	// 			tsKey: selectedRelationTsKey,
	// 			queryConfig: selectedRelationQueryConfig,
	// 			relation,
	// 		} = manyRelation;

	// 		distinct = {
	// 			on: tableConfig.primaryKey.map((c) => aliasedTableColumn(c as CockroachColumn, tableAlias)),
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
	// 			table: fullSchema[relationTableTsName] as CockroachTable,
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
	// 				: aliasedTable(builtRelationJoin.sql as CockroachTable, relationTableAlias),
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

	// 		tableFrom = is(builtTableFrom.sql, CockroachTable)
	// 			? builtTableFrom.sql
	// 			: new Subquery(builtTableFrom.sql, {}, tableAlias);
	// 	}

	// 	if (selectedColumns.length === 0 && selectedRelations.length === 0 && selectedExtras.length === 0) {
	// 		throw new DrizzleError(`No fields selected for table "${tableConfig.tsName}" ("${tableAlias}")`);
	// 	}

	// 	let selection: BuildRelationalQueryResult<CockroachTable, CockroachColumn>['selection'];

	// 	function prepareSelectedColumns() {
	// 		return selectedColumns.map((key) => ({
	// 			dbKey: tableConfig.columns[key]!.name,
	// 			tsKey: key,
	// 			field: tableConfig.columns[key] as CockroachColumn,
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
	// 				table: is(tableFrom, CockroachTable) ? aliasedTable(tableFrom, tableAlias) : tableFrom,
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
	// 		table: is(tableFrom, CockroachTable) ? aliasedTable(tableFrom, tableAlias) : tableFrom,
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
		schema: V1.TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: CockroachTable;
		tableConfig: V1.TableRelationalConfig;
		queryConfig: true | V1.DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: V1.Relation;
		joinOn?: SQL;
	}): V1.BuildRelationalQueryResult<CockroachTable, CockroachColumn> {
		let selection: V1.BuildRelationalQueryResult<CockroachTable, CockroachColumn>['selection'] = [];
		let limit, offset, orderBy: NonNullable<CockroachSelectConfig['orderBy']> = [], where;
		const joins: CockroachSelectJoinConfig[] = [];

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map((
				[key, value],
			) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as CockroachColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map((
					[key, value],
				) => [key, aliasedTableColumn(value, tableAlias)]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, V1.getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: { tsKey: string; value: CockroachColumn | SQL.Aliased }[] = [];
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
				const column = tableConfig.columns[field]! as CockroachColumn;
				fieldsSelection.push({ tsKey: field, value: column });
			}

			let selectedRelations: {
				tsKey: string;
				queryConfig: true | V1.DBQueryConfig<'many', false>;
				relation: V1.Relation;
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
				? config.orderBy(aliasedColumns, V1.getOrderByOperators())
				: config.orderBy ?? [];
			if (!Array.isArray(orderByOrig)) {
				orderByOrig = [orderByOrig];
			}
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) {
					return aliasedTableColumn(orderByValue, tableAlias) as CockroachColumn;
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
				const builtRelation = this.buildRelationalQueryWithoutPK({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as CockroachTable,
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
			if (is(nestedQueryRelation, V1.Many)) {
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
				table: is(result, CockroachTable) ? result : new Subquery(result, {}, tableAlias),
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
