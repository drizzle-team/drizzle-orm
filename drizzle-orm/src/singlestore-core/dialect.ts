import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type {
	AnyOne,
	BuildRelationalQueryResult,
	ColumnWithTSName,
	DBQueryConfig,
	RelationalRowsMapperGenerator,
	TableRelationalConfig,
	TablesRelationalConfig,
	WithContainer,
} from '~/relations.ts';
import {
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	relationExtrasToSQL,
	relationsFilterToSQL,
	relationsOrderToSQL,
	relationToSQL,
} from '~/relations.ts';
import { and } from '~/sql/expressions/index.ts';
import type { DriverValueDecoder, Name, Placeholder, Query, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { isSQLWrapper, Param, SQL, sql, StringChunk, View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/singlestore.ts';
import {
	getColumnFromDecoder,
	make$ReturningResponseMapper,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { resolveSingleStoreTypeAlias, type SingleStoreCodecs, type SingleStoreType } from './codecs.ts';
import { SingleStoreColumn } from './columns/common.ts';
import type { SingleStoreCustomColumn } from './columns/custom.ts';
import type { SingleStoreDeleteConfig } from './query-builders/delete.ts';
import type { SingleStoreInsertConfig } from './query-builders/insert.ts';
import type { SelectedFieldsOrdered, SingleStoreSelectConfig } from './query-builders/select.types.ts';
import type { SingleStoreUpdateConfig } from './query-builders/update.ts';
import type { SingleStoreSession } from './session.ts';
import { SingleStoreTable } from './table.ts';
import type { SingleStoreView } from './view.ts';

export interface SingleStoreDialectConfig {
	useJitMappers?: boolean;
	codecs?: SingleStoreCodecs;
}

interface BuildRelationalQueryResultWithOrder extends BuildRelationalQueryResult {
	order?: SQL;
}

export class SingleStoreDialect {
	static readonly [entityKind]: string = 'SingleStoreDialect';

	readonly codecs: CodecsCollection<SingleStoreType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
		$returning: typeof make$ReturningResponseMapper;
	};

	constructor(config?: SingleStoreDialectConfig) {
		this.codecs = new CodecsCollection<SingleStoreType>(resolveSingleStoreTypeAlias, config?.codecs);
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
		session: SingleStoreSession,
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

		const queriesLen = queries.length;
		const withSqlChunks: SQLChunk[] = new Array(queriesLen + 1);
		let writeIdx = 0;
		withSqlChunks[writeIdx++] = new StringChunk('with ');

		for (let i = 0; i < queriesLen; ++i) {
			const w = queries[i]!;
			withSqlChunks[writeIdx++] = (i < queriesLen - 1)
				? sql`${sql.identifier(w._.alias)} as (${w._.sql}), `
				: sql`${sql.identifier(w._.alias)} as (${w._.sql}) `;
		}

		return new SQL(withSqlChunks);
	}

	buildDeleteQuery({
		table,
		where,
		returning,
		withList,
		limit,
		orderBy,
		ignoreSelectionCastCodecs,
	}: SingleStoreDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs, table })
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const limitSql = this.buildLimit(limit);

		return sql`${withSql}delete from ${table}${whereSql}${orderBySql}${limitSql}${returningSql}`;
	}

	buildUpdateSet(table: SingleStoreTable, set: UpdateSet): SQL {
		const tableColumns = table[Table.Symbol.Columns];

		const columnNames = Object.keys(tableColumns).filter(
			(colName) =>
				set[colName] !== undefined
				|| tableColumns[colName]?.onUpdateFn !== undefined,
		);

		const setLength = columnNames.length;
		const setArr: SQLChunk[] = new Array(setLength);

		for (let i = 0; i < columnNames.length; ++i) {
			const colName = columnNames[i]!;
			const col = tableColumns[colName]!;

			let value;
			if (set[colName] !== undefined) {
				value = set[colName];
			} else {
				const updateRes = col.onUpdateFn?.();
				value = is(updateRes, SQL) ? updateRes : sql.param(updateRes, col);
			}

			setArr[i] = i < setLength - 1
				? sql`${sql.identifier(col.name)} = ${value}, `
				: sql`${sql.identifier(col.name)} = ${value}`;
		}

		return new SQL(setArr);
	}

	buildUpdateQuery({
		table,
		set,
		where,
		returning,
		withList,
		limit,
		orderBy,
		ignoreSelectionCastCodecs,
	}: SingleStoreUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: ignoreSelectionCastCodecs, table })
			}`
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
		{ isSingleTable = false, ignoreCastCodecs = false, table }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
			table?: SingleStoreTable | SQL | Subquery;
		} = {},
	): SQL {
		const { length: columnsLen } = fields;
		const chunks: SQLChunk[] = [];
		const tableName = table
			? is(table, SQL) || is(table, Subquery)
				? undefined
				: (table[Table.Symbol.IsAlias] || table[Table.Symbol.Schema] === undefined
					? table[Table.Symbol.Name]
					: `${table[Table.Symbol.Schema]}.${table[Table.Symbol.Name]}`)
			: undefined;

		for (let i = 0; i < columnsLen; ++i) {
			const { field, codecOverride, column, fieldType } = fields[i]!;
			const override = codecOverride as SingleStoreType | undefined;

			switch (fieldType) {
				case 'Column': {
					let name: Name | Column;
					if (isSingleTable) {
						name = field.isAlias
							? sql.identifier(getOriginalColumnFromAlias(field).name)
							: sql.identifier(field.name);
					} else {
						name = field.isAlias ? getOriginalColumnFromAlias(field) : field;
					}

					const casted = ignoreCastCodecs ? name : this.codecs.apply(field, 'cast', name, override);
					chunks.push(field.isAlias ? sql`${casted} as ${field}` : casted);

					break;
				}
				case 'SQL.Aliased': {
					if (field.isSelectionField) {
						const query = !isSingleTable && field.origin !== undefined
							? sql`${sql.identifier(field.origin)}.${sql.identifier(field.fieldAlias)}`
							: sql.identifier(field.fieldAlias);
						if (column && !ignoreCastCodecs) chunks.push(this.codecs.apply(column, 'cast', query, override));
						else chunks.push(query);
					} else {
						if (isSingleTable && tableName !== undefined) {
							const { queryChunks } = field.sql;
							const newChunks: SQLChunk[] = new Array(queryChunks.length);
							let abort = false;

							for (let i = 0; i < queryChunks.length; ++i) {
								const c = queryChunks[i]!;
								if (is(c, Column)) {
									const { table } = c;
									const columnTableName = table[Table.Symbol.IsAlias] || table[Table.Symbol.Schema] === undefined
										? table[Table.Symbol.Name]
										: `${table[Table.Symbol.Schema]}.${table[Table.Symbol.Name]}`;
									if (columnTableName !== tableName) {
										abort = true;
										break;
									}

									newChunks[i] = sql.identifier(c.name);
								} else {
									newChunks[i] = c;
								}
							}

							if (abort) {
								chunks.push(
									column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field.sql, override) : field.sql,
								);
							} else {
								const newSql = new SQL(newChunks);

								if (field.sql.shouldInlineParams) newSql.inlineParams();
								chunks.push(
									column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', newSql, override) : newSql,
								);
							}
						} else {
							chunks.push(
								column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field.sql, override) : field.sql,
							);
						}

						chunks.push(sql` as ${sql.identifier(field.fieldAlias)}`);
					}

					break;
				}
				case 'SQL': {
					if (isSingleTable && tableName !== undefined) {
						const { queryChunks } = field;
						const newChunks: SQLChunk[] = new Array(queryChunks.length);
						let abort = false;

						for (let i = 0; i < queryChunks.length; ++i) {
							const c = queryChunks[i]!;
							if (is(c, Column)) {
								const { table } = c;
								const columnTableName = table[Table.Symbol.IsAlias] || table[Table.Symbol.Schema] === undefined
									? table[Table.Symbol.Name]
									: `${table[Table.Symbol.Schema]}.${table[Table.Symbol.Name]}`;
								if (columnTableName !== tableName) {
									abort = true;
									break;
								}

								newChunks[i] = sql.identifier(c.name);
							} else {
								newChunks[i] = c;
							}
						}

						if (abort) {
							chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field, override) : field);
						} else {
							const newSql = new SQL(newChunks);
							if (field.shouldInlineParams) newSql.inlineParams();
							chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', newSql, override) : newSql);
						}
					} else chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field, override) : field);

					break;
				}
				case 'Subquery': {
					if (!field._.isWith) {
						const inner = sql`(${field._.sql})`;
						chunks.push(
							sql`${column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', inner, override) : inner} ${
								sql.identifier(field._.alias)
							}`,
						);
					} else {
						chunks.push(column && !ignoreCastCodecs ? this.codecs.apply(column, 'cast', field, override) : field);
					}

					break;
				}
			}

			if (i < columnsLen - 1) {
				chunks.push(new StringChunk(', '));
			}
		}

		return new SQL(chunks);
	}

	private buildLimit(limit: number | Placeholder | undefined): SQL | undefined {
		return typeof limit === 'object'
				|| (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;
	}

	private buildOrderBy(
		orderBy: (SingleStoreColumn | SQL | SQL.Aliased)[] | undefined,
	): SQL | undefined {
		return orderBy && orderBy.length > 0
			? sql` order by ${sql.join(orderBy, new StringChunk(', '))}`
			: undefined;
	}

	buildSelectQuery({
		withList,
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
		ignoreSelectionCastCodecs,
	}: SingleStoreSelectConfig): SQL {
		if (!fieldsFlat) {
			throw new Error('Select query builder must be provided with `fieldsFlat` on `buildSelectQuery` invocation');
		}
		const fieldsList = fieldsFlat;
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table)
					!== (is(table, Subquery)
						? table._.alias
						/* : is(table, SingleStoreViewBase)
						? table[ViewBaseConfig].name */
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

		const selection = this.buildSelection(fieldsList, {
			isSingleTable,
			table,
			ignoreCastCodecs: ignoreSelectionCastCodecs || setOperators.length > 0,
		});

		const tableSql = (() => {
			if (is(table, Table) && table[Table.Symbol.IsAlias]) {
				return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? '')}.`.if(table[Table.Symbol.Schema])}${
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

		const joinsArray: SQLChunk[] = [];

		if (joins) {
			for (const [index, joinMeta] of joins.entries()) {
				if (index === 0) {
					joinsArray.push(new StringChunk(' '));
				}
				const table = joinMeta.table;
				const lateralSql = joinMeta.lateral ? sql` lateral` : undefined;
				const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

				if (is(table, SingleStoreTable)) {
					const tableName = table[SingleStoreTable.Symbol.Name];
					const tableSchema = table[SingleStoreTable.Symbol.Schema];
					const origTableName = table[SingleStoreTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${
							tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined
						}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else if (is(table, View)) {
					const viewName = table[ViewBaseConfig].name;
					const viewSchema = table[ViewBaseConfig].schema;
					const origViewName = table[ViewBaseConfig].originalName;
					const alias = viewName === origViewName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${
							viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined
						}${sql.identifier(origViewName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else {
					joinsArray.push(
						sql`${new StringChunk(joinMeta.joinType)} join${lateralSql} ${table}${onSql}`,
					);
				}
				if (index < joins.length - 1) {
					joinsArray.push(new StringChunk(' '));
				}
			}
		}

		const joinsSql = new SQL(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, new StringChunk(', '))}`
			: undefined;

		const limitSql = this.buildLimit(limit);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		let lockingClausesSql;
		if (lockingClause) {
			const { config, strength } = lockingClause;
			lockingClausesSql = sql` for ${new StringChunk(strength)}`;
			if (config.noWait) {
				lockingClausesSql.append(sql` nowait`);
			} else if (config.skipLocked) {
				lockingClausesSql.append(sql` skip locked`);
			}
		}

		const finalQuery =
			sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}${lockingClausesSql}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, fieldsList, ignoreSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		ignoreSelectionCastCodecs: boolean | undefined,
		setOperators: SingleStoreSelectConfig['setOperators'],
	): SQL {
		for (let i = 0; i < setOperators.length; ++i) {
			const setOperator = setOperators[i]!;
			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator });
		}

		return ignoreSelectionCastCodecs ? leftSelect : sql`select ${
			this.buildSelection(
				outputSelection.map((field) => {
					if (field.fieldType === 'SQL.Aliased') {
						const ref = field.field.clone();
						ref.isSelectionField = true;
						return { ...field, field: ref, fieldType: 'SQL.Aliased' };
					}
					if (field.fieldType === 'Column' && field.field.isAlias) {
						const ref = new SQL.Aliased(sql`${sql.identifier(field.field.name)}`, field.field.name);
						ref.isSelectionField = true;
						return { ...field, field: ref, fieldType: 'SQL.Aliased' };
					}
					if (field.fieldType === 'Subquery') {
						const ref = new SQL.Aliased(sql`${field.field.getSQL()}`, field.field._.alias);
						ref.isSelectionField = true;
						return { ...field, field: ref, fieldType: 'SQL.Aliased' };
					}
					return field;
				}),
				{
					isSingleTable: true,
					ignoreCastCodecs: ignoreSelectionCastCodecs,
				},
			)
		} from (${leftSelect}) ${sql.identifier('drizzle_union')}`;
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator: { type, isAll, rightSelect, limit, orderBy, offset },
	}: {
		leftSelect: SQL;
		setOperator: SingleStoreSelectConfig['setOperators'][number];
	}): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.withoutSelectionCastCodecs().getSQL()})`;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid Sql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const singleOrderBy of orderBy) {
				if (is(singleOrderBy, SingleStoreColumn)) {
					orderByValues.push(sql.identifier(singleOrderBy.name));
				} else if (is(singleOrderBy, SQL)) {
					for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
						const chunk = singleOrderBy.queryChunks[i];

						if (is(chunk, SingleStoreColumn)) {
							singleOrderBy.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${singleOrderBy}`);
				} else {
					orderByValues.push(sql`${singleOrderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, new StringChunk(', '))}`;
		}

		const limitSql = typeof limit === 'object' || (typeof limit === 'number' && limit >= 0)
			? sql` limit ${limit}`
			: undefined;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);

		const offsetSql = offset ? sql` offset ${offset}` : undefined;

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}

	buildInsertQuery({
		table,
		values,
		ignore,
		onConflict,
		columnList,
	}: SingleStoreInsertConfig): {
		sql: SQL;
		generatedIds: Record<string, unknown>[];
	} {
		// const isSingleValue = values.length === 1;
		const columns: Record<string, SingleStoreColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, SingleStoreColumn][] = columnList
			? columnList.map((name) => [name, columns[name]!] as [string, SingleStoreColumn])
			: Object.entries(
				columns,
			).filter(([_, col]) => !col.shouldDisableInsert());

		const insertOrderArr: SQLChunk[] = new Array(colEntries.length * 2 + 1);
		let orderWriteIdx = 0;
		insertOrderArr[orderWriteIdx++] = new StringChunk('(');
		for (let i = 0; i < colEntries.length; ++i) {
			const [, { name }] = colEntries[i]!;
			insertOrderArr[orderWriteIdx++] = sql.identifier(name);

			if (i < colEntries.length - 1) insertOrderArr[orderWriteIdx++] = new StringChunk(', ');
		}
		insertOrderArr[orderWriteIdx++] = new StringChunk(')');
		const insertOrder = new SQL(insertOrderArr);
		const generatedIdsResponse: Record<string, unknown>[] = [];

		const valuesSqlList: SQLChunk[] = Array.from({
			length: (colEntries.length * 2 + 1) * values.length + values.length - 1,
		});

		let writeIdx = 0;
		for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
			const value = values[valueIndex]!;
			const generatedIds: Record<string, unknown> = {};

			valuesSqlList[writeIdx++] = new StringChunk('(');
			for (let i = 0; i < colEntries.length; ++i) {
				const [fieldName, col] = colEntries[i]!;
				const colValue = value[fieldName];
				if (colValue === undefined) {
					// eslint-disable-next-line unicorn/no-negated-condition
					if (col.defaultFn !== undefined) {
						const defaultFnResult = col.defaultFn();
						generatedIds[fieldName] = defaultFnResult;
						const defaultValue = is(defaultFnResult, SQL)
							? defaultFnResult
							: sql.param(defaultFnResult, col);
						valuesSqlList[writeIdx++] = defaultValue;
						// eslint-disable-next-line unicorn/no-negated-condition
					} else if (!col.default && col.onUpdateFn !== undefined) {
						const onUpdateFnResult = col.onUpdateFn();
						const newValue = is(onUpdateFnResult, SQL)
							? onUpdateFnResult
							: sql.param(onUpdateFnResult, col);
						valuesSqlList[writeIdx++] = newValue;
					} else {
						valuesSqlList[writeIdx++] = new StringChunk(`default`);
					}
				} else if (is(colValue, SQL)) {
					valuesSqlList[writeIdx++] = colValue;
				} else {
					if (col.defaultFn) {
						generatedIds[fieldName] = colValue;
					}
					valuesSqlList[writeIdx++] = new Param(colValue, col);
				}

				if (i < colEntries.length - 1) {
					valuesSqlList[writeIdx++] = new StringChunk(', ');
				}
			}

			generatedIdsResponse.push(generatedIds);

			valuesSqlList[writeIdx++] = new StringChunk(')');

			if (valueIndex < values.length - 1) {
				valuesSqlList[writeIdx++] = new StringChunk(`, `);
			}
		}

		const valuesSql = new SQL(valuesSqlList);

		const ignoreSql = ignore ? sql` ignore` : undefined;

		const onConflictSql = onConflict
			? sql` on duplicate key ${onConflict}`
			: undefined;

		return {
			sql: sql`insert${ignoreSql} into ${table} ${insertOrder} values ${valuesSql}${onConflictSql}`,
			generatedIds: generatedIdsResponse,
		};
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): Query {
		return sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			codecs: this.codecs,
			invokeSource,
		});
	}

	private buildRqbColumn(
		table: Table | View,
		field: unknown,
		key: string,
		inJson: boolean,
		selection: BuildRelationalQueryResult['selection'],
		tableTsName: string,
	) {
		let decoderColumn: Column | undefined;
		let subqueryDecoder: DriverValueDecoder<any, any> | undefined;
		let fieldType: BuildRelationalQueryResult['selection'][number]['fieldType'];
		let output: SQL;

		if (is(field, Column)) {
			decoderColumn = field;
			fieldType = 'Column';

			const name = sql`${table}.${sql.identifier(field.name)}`;
			const casted = inJson && (<SingleStoreCustomColumn<any>> field).jsonSelectIdentifier
				? (<SingleStoreCustomColumn<any>> field).jsonSelectIdentifier!(name, sql)
				: this.codecs.apply(field, inJson ? 'castInJson' : 'cast', name);

			output = sql`${casted} as ${sql.identifier(key)}`;
		} else if (is(field, SQL)) {
			decoderColumn = is(field.decoder, Column) ? field.decoder : undefined;
			fieldType = 'SQL';

			const q = sql`${table}.${sql.identifier(key)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else if (is(field, SQL.Aliased)) {
			decoderColumn = is(field.sql.decoder, Column) ? field.sql.decoder : undefined;
			fieldType = 'SQL.Aliased';

			const q = sql`${table}.${sql.identifier(field.fieldAlias)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else if (is(field, Subquery)) {
			const innerField = Object.values(field._.selectedFields)[0];

			if (is(innerField, Column)) {
				decoderColumn = innerField;
				subqueryDecoder = innerField;
			} else if (is(innerField, SQL.Aliased)) {
				decoderColumn = getColumnFromDecoder(innerField);
				subqueryDecoder = innerField.sql.decoder;
			} else if (is(innerField, SQL)) {
				decoderColumn = getColumnFromDecoder(innerField);
				subqueryDecoder = innerField.decoder;
			}
			fieldType = 'Subquery';

			const q = sql`${table}.${sql.identifier(field._.alias)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else if (isSQLWrapper(field)) {
			const query = (field as SQLWrapper).getSQL();
			decoderColumn = is(query.decoder, Column) ? query.decoder : undefined;
			fieldType = 'SQLWrapper';

			const q = sql`${table}.${sql.identifier(key)}`;
			output = sql`${decoderColumn ? this.codecs.apply(decoderColumn, inJson ? 'castInJson' : 'cast', q) : q} as ${
				sql.identifier(key)
			}`;
		} else {
			throw new DrizzleError({
				message: field === undefined
					? `Unknown column: "${tableTsName}"."${key}"`
					: `Views with nested selections are not supported by the relational query builder`,
			});
		}

		selection.push(
			(decoderColumn
				? {
					key,
					field,
					fieldType,
					subqueryDecoder,
					codec: !inJson || !(<SingleStoreCustomColumn<any>> decoderColumn).mapFromJsonValue
						? this.codecs.get(decoderColumn, inJson ? 'normalizeInJson' : 'normalize')
						: undefined,
				}
				: {
					key,
					field,
					fieldType,
					subqueryDecoder,
				}) as BuildRelationalQueryResult['selection'][number],
		);

		return output;
	}

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
		table: SingleStoreTable | SingleStoreView,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
		tableTsName: string,
		config?: DBQueryConfig<'many'>,
	) => {
		if (!config?.columns) {
			return sql.join(
				Object.entries(table[TableColumns]).map(([k, v]) => {
					return this.buildRqbColumn(table, v, k, inJson, selection, tableTsName);
				}),
				new StringChunk(', '),
			);
		}

		const columnIdentifiers: SQL[] = [];
		const selectedColumns = this.getSelectedTableColumns(
			table,
			config.columns,
		);

		for (const { column, tsName } of selectedColumns) {
			columnIdentifiers.push(this.buildRqbColumn(table, column, tsName, inJson, selection, tableTsName));
		}

		return columnIdentifiers.length
			? sql.join(columnIdentifiers, new StringChunk(', '))
			: undefined;
	};

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
		nested,
	}: {
		schema: TablesRelationalConfig;
		table: SingleStoreTable | SingleStoreView;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfig<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		isNestedMany?: boolean;
		throughJoin?: SQL;
		nested?: boolean;
	}): BuildRelationalQueryResultWithOrder {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const columns = this.buildColumns(table, selection, !!nested, tableConfig.name, params);

		const where: SQL | undefined = params && 'where' in params && relationWhere
			? and(
				relationsFilterToSQL(
					table,
					params.where,
					tableConfig.relations,
					schema,
				),
				relationWhere,
			)
			: params && 'where' in params
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
			? relationExtrasToSQL(table, params.extras, this.codecs, nested)
			: undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = columns ? [columns] : [];
		if (extras?.sql) selectionArr.push(extras.sql);

		let joins: SQL | undefined;
		switch (params) {
			case undefined:
				break;
			default: {
				const { with: withParam } = params as WithContainer;
				if (!withParam) break;

				const withEntries = Object.entries(withParam).filter(([_, v]) => v);
				if (!withEntries.length) break;

				const joinChunks: SQLChunk[] = new Array(withEntries.length * 2);
				joinChunks[0] = new StringChunk(' ');

				for (let readIdx = 0, writeIdx = 1; readIdx < withEntries.length; ++readIdx) {
					const [k, join] = withEntries[readIdx]!;

					const relation = tableConfig.relations[k];
					if (!relation) throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });
					const isSingle = relation.relationType === 'one';
					selectionArr.push(
						isSingle
							? sql`${sql.identifier(k)}.${sql.identifier('r')} as ${sql.identifier(k)}`
							: sql`coalesce(${sql.identifier(k)}.${sql.identifier('r')}, json_build_array()) as ${
								sql.identifier(
									k,
								)
							}`,
					);
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
						table: targetTable as SingleStoreTable,
						mode: isSingle ? 'first' : 'many',
						schema,
						queryConfig: join as DBQueryConfig,
						tableConfig: schema[relation.targetTableName]!,
						relationWhere: filter,
						errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
						depth: currentDepth + 1,
						isNestedMany: !isSingle,
						throughJoin,
						nested: true,
					});

					selection.push({
						field: targetTable,
						fieldType: 'Nested',
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
							(s) => sql`${new StringChunk(this.escapeString(s.key))}, ${sql.identifier(s.key)}`,
						),
						new StringChunk(', '),
					);

					const joinQuery = sql`left join lateral(select ${sql`${
						isSingle
							? sql`json_build_object(${jsonColumns})`
							: sql`json_agg(json_build_object(${jsonColumns})${
								innerQuery.order
									? sql` ORDER BY ${sql.identifier(`$drizzle_order_row_number`)}`
									: undefined
							})`
					} as ${sql.identifier('r')}`} from (${innerQuery.sql}) as ${sql.identifier('t')}) as ${
						sql.identifier(
							k,
						)
					} on true`;

					joinChunks[writeIdx++] = joinQuery;
					if (readIdx < withEntries.length - 1) joinChunks[writeIdx++] = new StringChunk(' ');
				}

				joins = new SQL(joinChunks);

				break;
			}
		}

		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}

		if (isNestedMany && order) {
			selectionArr.push(
				sql`row_number() over (order by ${order}) as ${sql.identifier(`$drizzle_order_row_number`)}`,
			);
		}
		const selectionSet = sql.join(selectionArr, new StringChunk(', '));

		const query = sql`select ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${joins}${
			sql` where ${where}`.if(
				where,
			)
		}${sql` order by ${order}`.if(order)}${sql` limit ${limit}`.if(limit !== undefined)}${
			sql` offset ${offset}`.if(
				offset !== undefined,
			)
		}`;

		return {
			sql: query,
			selection,
			order,
		};
	}
}
