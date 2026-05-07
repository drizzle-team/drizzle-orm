import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type {
	AnyOne,
	BuildRelationalQueryResult,
	ColumnWithTSName,
	DBQueryConfigWithComment,
	Relation,
	RelationalRowsMapperGenerator,
	TableRelationalConfig,
	TablesRelationalConfig,
	WithContainer,
} from '~/relations.ts';
import {
	// AggregatedField,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	One,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
} from '~/relations.ts';
import { and } from '~/sql/expressions/index.ts';
import { isSQLWrapper, Param, SQL, sql, View } from '~/sql/sql.ts';
import type { Name, Placeholder, Query, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/mysql.ts';
import {
	make$ReturningResponseMapper,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	orderSelectedFields,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { MySqlColumn } from './columns/common.ts';
import type { MySqlCustomColumn } from './columns/custom.ts';
import type { MySqlDeleteConfig } from './query-builders/delete.ts';
import type { MySqlInsertConfig } from './query-builders/insert.ts';
import type {
	AnyMySqlSelectQueryBuilder,
	MySqlSelectConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { MySqlUpdateConfig } from './query-builders/update.ts';
import type { MySqlSession } from './session.ts';
import { MySqlTable } from './table.ts';
import { MySqlViewBase } from './view-base.ts';
import type { MySqlView } from './view.ts';

export interface MySqlDialectConfig {
	escapeParam?: (num: number) => string;
	useJitMappers?: boolean;
}

export class MySqlDialect {
	static readonly [entityKind]: string = 'MySqlDialect';

	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
		$returning: typeof make$ReturningResponseMapper; // TODO: jit ver
	};

	constructor(config?: MySqlDialectConfig) {
		if (config?.escapeParam) {
			this.escapeParam = config.escapeParam;
		}

		this.mapperGenerators = config?.useJitMappers
			? {
				rows: makeJitQueryMapper,
				relationalRows: makeJitRqbMapper,
				$returning: make$ReturningResponseMapper,
			}
			: {
				rows: makeDefaultQueryMapper,
				relationalRows: makeDefaultRqbMapper,
				$returning: make$ReturningResponseMapper,
			};
	}

	async migrate(
		migrations: MigrationMeta[],
		session: MySqlSession,
		config: Omit<MigrationConfig, 'migrationsSchema'>,
	): Promise<void | MigratorInitFailResponse> {
		const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

		// Detect DB version and upgrade table schema if needed
		const { newDb } = await upgradeIfNeeded(
			migrationsTable,
			session,
			migrations,
		);

		if (newDb) {
			const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash TEXT NOT NULL,
				created_at BIGINT,
				name TEXT,
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)
		`;
			await session.execute(migrationTableCreate);
		}

		const dbMigrations = await session.objects<{
			id: number;
			hash: string;
			created_at: string;
			name: string | null;
		}>(
			sql`select id, hash, created_at, name from ${sql.identifier(migrationsTable)}`,
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
				sql`insert into ${
					sql.identifier(
						migrationsTable,
					)
				} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
			);

			return;
		}

		const migrationsToRun = getMigrationsToRun({
			localMigrations: migrations,
			dbMigrations,
		});
		await session.transaction(async (tx) => {
			for (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					await tx.execute(sql.raw(stmt));
				}
				await tx.execute(
					sql`insert into ${
						sql.identifier(
							migrationsTable,
						)
					} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
				);
			}
		});
	}

	escapeName(name: string): string {
		return `\`${name.replace(/`/g, '``')}\``;
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

	buildDeleteQuery({
		table,
		where,
		returning,
		withList,
		limit,
		orderBy,
		comment,
	}: MySqlDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}delete from ${table}${whereSql}${orderBySql}${limitSql}${returningSql}${
			comment !== undefined ? sql` ${comment}` : undefined
		}`;
	}

	buildUpdateSet(table: MySqlTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter(
			(colName) =>
				set[colName] !== undefined
				|| tableColumns[colName]?.onUpdateFn !== undefined,
		);

		const setLength = columnNames.length;
		return sql.join(
			columnNames.flatMap((colName, i) => {
				const col = tableColumns[colName]!;

				const onUpdateFnResult = col.onUpdateFn?.();
				const value = set[colName]
					?? (is(onUpdateFnResult, SQL)
						? onUpdateFnResult
						: sql.param(onUpdateFnResult, col));
				const res = sql`${sql.identifier(col.name)} = ${value}`;

				if (i < setLength - 1) {
					return [res, sql.raw(', ')];
				}
				return [res];
			}),
		);
	}

	buildUpdateQuery({
		table,
		set,
		where,
		returning,
		withList,
		limit,
		orderBy,
		comment,
	}: MySqlUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}update ${table} set ${setSql}${whereSql}${orderBySql}${limitSql}${returningSql}${
			comment !== undefined ? sql` ${comment}` : undefined
		}`;
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

		const chunks = fields.flatMap(({ field }, i) => {
			const chunk: SQLChunk[] = [];

			if (is(field, SQL.Aliased) && field.isSelectionField) {
				if (!isSingleTable && field.origin !== undefined) {
					chunk.push(sql.identifier(field.origin), sql.raw('.'));
				}
				chunk.push(sql.identifier(field.fieldAlias));
			} else if (is(field, SQL.Aliased) || is(field, SQL)) {
				const query = is(field, SQL.Aliased) ? field.sql : field;

				if (isSingleTable) {
					const newSql = new SQL(
						query.queryChunks.map((c) => {
							if (is(c, MySqlColumn)) {
								return sql.identifier(c.name);
							}
							return c;
						}),
					);

					chunk.push(query.shouldInlineParams ? newSql.inlineParams() : newSql);
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
							? sql`${sql.identifier(getOriginalColumnFromAlias(field).name)} as ${field}`
							: sql.identifier(field.name),
					);
				} else {
					chunk.push(
						field.isAlias
							? sql`${getOriginalColumnFromAlias(field)} as ${field}`
							: field,
					);
				}
			} else if (is(field, Subquery)) {
				const entries = Object.entries(field._.selectedFields) as [
					string,
					SQL.Aliased | Column | SQL,
				][];

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

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object'
				|| (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;
	}

	private buildOrderBy(
		orderBy: (MySqlColumn | SQL | SQL.Aliased)[] | undefined,
	): SQL | undefined {
		return orderBy && orderBy.length > 0
			? sql` order by ${sql.join(orderBy, sql`, `)}`
			: undefined;
	}

	private buildIndex({
		indexes,
		indexFor,
	}: {
		indexes: string[] | undefined;
		indexFor: 'USE' | 'FORCE' | 'IGNORE';
	}): SQL | undefined {
		return indexes && indexes.length > 0
			? sql` ${sql.raw(indexFor)} INDEX ${indexes.map((it) => sql.identifier(it))}`
			: undefined;
	}

	buildSelectQuery({
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
		comment,
	}: MySqlSelectConfig): SQL {
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
					joins?.some(
						({ alias }) =>
							alias
								=== (table[Table.Symbol.IsAlias]
									? getTableName(table)
									: table[Table.Symbol.BaseName]),
					))(f.field.table)
			) {
				const tableName = getTableName(f.field.table);
				throw new Error(
					`Your "${
						f.path.join(
							'->',
						)
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
				return sql`${table[Table.Symbol.Schema] ? sql`${sql.identifier(table[Table.Symbol.Schema]!)}.` : undefined}${
					sql.identifier(
						table[Table.Symbol.OriginalName],
					)
				} ${sql.identifier(table[Table.Symbol.Name])}`;
			}

			if (is(table, View) && table[ViewBaseConfig].isAlias) {
				let fullName = sql`${sql.identifier(table[ViewBaseConfig].originalName)}`;
				if (table[ViewBaseConfig].schema) {
					fullName = sql`${sql.identifier(table[ViewBaseConfig].schema)}.${fullName}`;
				}
				return sql`${fullName} ${sql.identifier(table[ViewBaseConfig].name)}`;
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
				const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

				if (is(table, MySqlTable)) {
					const tableName = table[MySqlTable.Symbol.Name];
					const tableSchema = table[MySqlTable.Symbol.Schema];
					const origTableName = table[MySqlTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					const useIndexSql = this.buildIndex({
						indexes: joinMeta.useIndex,
						indexFor: 'USE',
					});
					const forceIndexSql = this.buildIndex({
						indexes: joinMeta.forceIndex,
						indexFor: 'FORCE',
					});
					const ignoreIndexSql = this.buildIndex({
						indexes: joinMeta.ignoreIndex,
						indexFor: 'IGNORE',
					});
					joinsArray.push(
						sql`${sql.raw(joinMeta.joinType)} join${lateralSql} ${
							tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
						}${sql.identifier(origTableName)}${useIndexSql}${forceIndexSql}${ignoreIndexSql}${
							alias && sql` ${sql.identifier(alias)}`
						}${onSql}`,
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
		}

		const joinsSql = sql.join(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, sql`, `)}`
			: undefined;

		const limitSql = this.buildLimit(limit);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		const useIndexSql = this.buildIndex({ indexes: useIndex, indexFor: 'USE' });

		const forceIndexSql = this.buildIndex({
			indexes: forceIndex,
			indexFor: 'FORCE',
		});

		const ignoreIndexSql = this.buildIndex({
			indexes: ignoreIndex,
			indexFor: 'IGNORE',
		});

		let lockingClausesSql;
		if (lockingClause) {
			const { config, strength } = lockingClause;
			lockingClausesSql = sql` for ${sql.raw(strength)}`;
			if (config.noWait) {
				lockingClausesSql.append(sql` nowait`);
			} else if (config.skipLocked) {
				lockingClausesSql.append(sql` skip locked`);
			}
		}

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${useIndexSql}${forceIndexSql}${ignoreIndexSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}${
				comment !== undefined ? sql` ${comment}` : undefined
			}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		setOperators: MySqlSelectConfig['setOperators'],
	): SQL {
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
	}: {
		leftSelect: SQL;
		setOperator: MySqlSelectConfig['setOperators'][number];
	}): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MySql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderByUnit of orderBy) {
				if (is(orderByUnit, MySqlColumn)) {
					orderByValues.push(
						sql.identifier(orderByUnit.name),
					);
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

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = sql.raw(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({
		table,
		values: valuesOrSelect,
		ignore,
		onConflict,
		select,
		comment,
	}: MySqlInsertConfig): { sql: SQL; generatedIds: Record<string, unknown>[] } {
		// const isSingleValue = values.length === 1;
		const valuesSqlList: ((SQLChunk | SQL)[] | SQL)[] = [];
		const columns: Record<string, MySqlColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, MySqlColumn][] = Object.entries(columns).filter(
			([_, col]) => !col.shouldDisableInsert(),
		);

		const insertOrder = colEntries.map(([, column]) => sql.identifier(column.name));
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
					if (
						colValue === undefined
						|| (is(colValue, Param) && colValue.value === undefined)
					) {
						// eslint-disable-next-line unicorn/no-negated-condition
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							generatedIds[fieldName] = defaultFnResult;
							const defaultValue = is(defaultFnResult, SQL)
								? defaultFnResult
								: sql.param(defaultFnResult, col);
							valueList.push(defaultValue);
							// eslint-disable-next-line unicorn/no-negated-condition
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							const newValue = is(onUpdateFnResult, SQL)
								? onUpdateFnResult
								: sql.param(onUpdateFnResult, col);
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

		const onConflictSql = onConflict
			? sql` on duplicate key ${onConflict}`
			: undefined;

		return {
			sql: sql`insert${ignoreSql} into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${
				comment !== undefined ? sql` ${comment}` : undefined
			}`,
			generatedIds: generatedIdsResponse,
		};
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			invokeSource,
		});
	}

	private nestedSelectionerror() {
		throw new DrizzleError({
			message: `Views with nested selections are not supported by the relational query builder`,
		});
	}

	private buildRqbColumn(table: Table | View, column: unknown, key: string) {
		if (is(column, Column)) {
			const name = sql`${table}.${sql.identifier(column.name)}`;

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
				case 'MySqlBigInt64':
				case 'MySqlBigIntString': {
					return sql`cast(${name} as char) as ${sql.identifier(key)}`;
				}

				case 'MySqlBlob':
				case 'MySqlBlobBuffer': {
					return sql`to_base64(${name}) as ${sql.identifier(key)}`;
				}

				case 'MySqlCustomColumn': {
					return sql`${(<MySqlCustomColumn<any>> column).jsonSelectIdentifier(name, sql)} as ${sql.identifier(key)}`;
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

	private unwrapAllColumns = (
		table: Table | View,
		selection: BuildRelationalQueryResult['selection'],
	) => {
		return sql.join(
			Object.entries(table[TableColumns]).map(([k, v]) => {
				selection.push({
					key: k,
					field: v as Column | SQL | SQLWrapper | SQL.Aliased,
				});

				return this.buildRqbColumn(table, v, k);
			}),
			sql`, `,
		);
	};

	private getSelectedTableColumns = (
		table: Table | View,
		columns: Record<string, boolean | undefined>,
	) => {
		const selectedColumns: ColumnWithTSName[] = [];
		const columnContainer = table[TableColumns];
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
		params?: DBQueryConfigWithComment<'many'>,
	) =>
		params?.columns
			? (() => {
				const columnIdentifiers: SQL[] = [];

				const selectedColumns = this.getSelectedTableColumns(
					table,
					params.columns,
				);

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

	buildRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		errorPath,
		depth,
		isNestedMany,
		throughJoin,
	}: {
		schema: TablesRelationalConfig;
		table: MySqlTable | MySqlView;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfigWithComment<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		isNestedMany?: boolean;
		throughJoin?: SQL;
	}): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const columns = this.buildColumns(table, selection, params);

		const where: SQL | undefined = params?.where && relationWhere
			? and(
				relationsFilterToSQL(
					table,
					params.where,
					tableConfig.relations,
					schema,
				),
				relationWhere,
			)
			: params?.where
			? relationsFilterToSQL(
				table,
				params.where,
				tableConfig.relations,
				schema,
			)
			: relationWhere;
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy)
			: undefined;
		const extras = params?.extras
			? relationExtrasToSQL(table, params.extras)
			: undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = columns ? [columns] : [];
		if (extras?.sql) selectionArr.push(extras.sql);

		const joins = params
			? (() => {
				const { with: joins } = params as WithContainer;
				if (!joins) return;

				const withEntries = Object.entries(joins).filter(([_, v]) => v);
				if (!withEntries.length) return;

				return sql.join(
					withEntries.map(([k, join]) => {
						selectionArr.push(
							sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`,
						);

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
						const targetTable = aliasedTable(
							relation.targetTable,
							`d${currentDepth + 1}`,
						);
						const throughTable = relation.throughTable
							? aliasedTable(relation.throughTable, `tr${currentDepth}`)
							: undefined;
						const { filter, joinCondition } = relationToSQL(
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
							queryConfig: join as DBQueryConfigWithComment,
							tableConfig: schema[relation.targetTableName]!,
							relationWhere: filter,
							errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
							depth: currentDepth + 1,
							isNestedMany: !isSingle,
							throughJoin,
						});

						selection.push({
							field: targetTable,
							key: k,
							selection: innerQuery.selection,
							isArray: !isSingle,
							isOptional: ((relation as AnyOne).optional ?? false)
								|| (join !== true
									&& !!(join as Exclude<typeof join, boolean | undefined>)
										.where),
						});

						const jsonColumns = sql.join(
							innerQuery.selection.map(
								(s) => sql`${sql.raw(this.escapeString(s.key))}, ${sql.identifier(s.key)}`,
							),
							sql`, `,
						);

						const joinQuery = sql` left join lateral(select ${sql`${
							isSingle
								? sql`json_object(${jsonColumns})`
								: sql`coalesce(json_arrayagg(json_object(${jsonColumns})), json_array())`
						} as ${sql.identifier('r')}`} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${
							sql.identifier(
								k,
							)
						} on true`;

						return joinQuery;
					}),
				);
			})()
			: undefined;

		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		// json_arrayagg() ignores order by clause otherwise
		if (isNestedMany && order) {
			selectionArr.push(sql`row_number() over (order by ${order})`);
		}
		const selectionSet = sql.join(selectionArr, sql`, `);
		const comment = config !== true && config?.comment
			? sql.comment(config.comment)
			: undefined;

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${
			joins ? sql`${joins}` : undefined
		}${where ? sql` where ${where}` : undefined}${order ? sql` order by ${order}` : undefined}${
			limit !== undefined ? sql` limit ${limit}` : undefined
		}${offset !== undefined ? sql` offset ${offset}` : undefined}${comment ? sql` ${comment}` : undefined}`;

		return {
			sql: query,
			selection,
		};
	}
}
