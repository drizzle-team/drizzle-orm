import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type {
	AnyOne,
	BuildRelationalQueryConfig,
	BuildRelationalQueryResult,
	DBQueryConfig,
	RelationalRowsMapperGenerator,
	WithContainer,
} from '~/relations.ts';
import {
	buildRqbColumns,
	collectRelationalSubquery,
	getTableAsAliasSQL,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	relationalQueryWhereToSQL,
	type RelationalWithSubqueries,
	relationExtrasToSQL,
	relationsOrderToSQL,
	relationToSQL,
} from '~/relations.ts';
import { commonStringChunks, StringChunk } from '~/sql/common-chunks.ts';
import type { Name, Placeholder, Query, SQLChunk } from '~/sql/sql.ts';
import { SQL, sql } from '~/sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk } from '~/sql/sql.ts';
import { ValueRows } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/singlestore.ts';
import {
	make$ReturningResponseMapper,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	memoizeEscape,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { View } from '~/view.ts';
import { resolveSingleStoreTypeAlias, type SingleStoreCodecs, type SingleStoreType } from './codecs.ts';
import { SingleStoreColumn } from './columns/common.ts';
import type { SingleStoreDeleteConfig } from './query-builders/delete.ts';
import type { SingleStoreInsertConfig } from './query-builders/insert.ts';
import type { SelectedFieldsOrdered, SingleStoreSelectConfig } from './query-builders/select.types.ts';
import type { SingleStoreUpdateConfig } from './query-builders/update.ts';
import type { SingleStoreSession } from './session.ts';
import { SingleStoreTable } from './table.ts';

export interface SingleStoreDialectConfig {
	useJitMappers?: boolean;
	codecs?: SingleStoreCodecs;
}

interface SingleStoreBuildRelationalQueryConfig
	extends Omit<BuildRelationalQueryConfig<DBQueryConfig<'many'>>, 'strategy'>
{
	isNestedMany?: boolean;
}

export interface BuildRelationalQueryResultWithOrder extends BuildRelationalQueryResult {
	order?: SQLChunk[];
}

// Stored separately - differ per dialect
const rqbChunks = {
	relationField: new StringChunk('.`r` as '),
	coalesceOpen: new StringChunk('coalesce('),
	relationFieldMany: new StringChunk('.`r`, json_build_array()) as '),
	rowNumber: new StringChunk(', row_number() over (order by '),
	rowNumberAs: new StringChunk(') as `$drizzle_order_row_number`'),
	joinOpen: new StringChunk(' left join lateral(select '),
	joinFrom: new StringChunk(' as `r` from ('),
	joinClose: new StringChunk(') as `t`) as '),
	onTrue: new StringChunk(' on true'),
	jsonObjectOpen: new StringChunk('json_build_object('),
	jsonAggOpen: new StringChunk('json_agg(json_build_object('),
	aggOrder: new StringChunk(' ORDER BY `$drizzle_order_row_number`'),
} as const;

const escapeSingleStoreName = memoizeEscape((name) => `\`${name.replace(/`/g, '``')}\``);
export class SingleStoreDialect {
	static readonly [entityKind]: string = 'SingleStoreDialect';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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
		return escapeSingleStoreName(name);
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
		withSqlChunks[writeIdx++] = commonStringChunks['with '];

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
		useSelectionCastCodecs,
	}: SingleStoreDeleteConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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
		useSelectionCastCodecs,
	}: SingleStoreUpdateConfig): SQL {
		const withSql = this.buildWithCTE(withList);

		const setSql = this.buildUpdateSet(table, set);

		const returningSql = returning
			? sql` returning ${
				this.buildSelection(returning, { isSingleTable: true, ignoreCastCodecs: !useSelectionCastCodecs, table })
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
		const tableKind = chunkKindOf(table);
		const tableName = table
			? isChunk(table, tableKind, chunkKinds.sql) || isChunk(table, tableKind, chunkKinds.subquery)
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
				chunks.push(commonStringChunks[', ']);
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
			? sql` order by ${sql.join(orderBy, commonStringChunks[', '])}`
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
		useSelectionCastCodecs,
	}: SingleStoreSelectConfig): SQL {
		if (!fieldsFlat) {
			throw new Error('Select query builder must be provided with `fieldsFlat` on `buildSelectQuery` invocation');
		}
		const fieldsList = fieldsFlat;

		const tableKind = chunkKindOf(table);
		const ownTableName = isChunk(table, tableKind, chunkKinds.subquery)
			? table._.alias
			/* : is(table, SingleStoreViewBase)
			? table[ViewBaseConfig].name */
			: isChunk(table, tableKind, chunkKinds.sql)
			? undefined
			: getTableName(table);
		for (const f of fieldsList) {
			if (
				is(f.field, Column)
				&& getTableName(f.field.table) !== ownTableName
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
			ignoreCastCodecs: !useSelectionCastCodecs || setOperators.length > 0,
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
					joinsArray.push(commonStringChunks[' ']);
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
					joinsArray.push(commonStringChunks[' ']);
				}
			}
		}

		const joinsSql = new SQL(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		const orderBySql = this.buildOrderBy(orderBy);

		const groupBySql = groupBy && groupBy.length > 0
			? sql` group by ${sql.join(groupBy, commonStringChunks[', '])}`
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
			return this.buildSetOperations(finalQuery, fieldsList, useSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		useSelectionCastCodecs: boolean | undefined,
		setOperators: SingleStoreSelectConfig['setOperators'],
	): SQL {
		for (let i = 0; i < setOperators.length; ++i) {
			const setOperator = setOperators[i]!;
			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator });
		}

		return !useSelectionCastCodecs ? leftSelect : sql`select ${
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
					ignoreCastCodecs: !useSelectionCastCodecs,
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
		const rightChunk = sql`(${rightSelect.getSQL()})`;

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

			orderBySql = sql` order by ${sql.join(orderByValues, commonStringChunks[', '])}`;
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
		insertOrderArr[orderWriteIdx++] = commonStringChunks['('];
		for (let i = 0; i < colEntries.length; ++i) {
			const [, { name }] = colEntries[i]!;
			insertOrderArr[orderWriteIdx++] = sql.identifier(name);

			if (i < colEntries.length - 1) insertOrderArr[orderWriteIdx++] = commonStringChunks[', '];
		}
		insertOrderArr[orderWriteIdx++] = commonStringChunks[')'];
		const insertOrder = new SQL(insertOrderArr);
		const generatedIdsResponse: Record<string, unknown>[] = [];

		let valuesSqlList: SQLChunk[];

		const cells: unknown[] = new Array(values.length * colEntries.length);
		let writeIdx = 0;
		for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
			const value = values[valueIndex]!;
			const generatedIds: Record<string, unknown> = {};

			for (let i = 0; i < colEntries.length; ++i) {
				const [fieldName, col] = colEntries[i]!;
				const colValue = value[fieldName];
				if (colValue === undefined) {
					// eslint-disable-next-line unicorn/no-negated-condition
					if (col.defaultFn !== undefined) {
						const defaultFnResult = col.defaultFn();
						generatedIds[fieldName] = defaultFnResult;
						cells[writeIdx++] = defaultFnResult;
						// eslint-disable-next-line unicorn/no-negated-condition
					} else if (!col.default && col.onUpdateFn !== undefined) {
						cells[writeIdx++] = col.onUpdateFn();
					} else {
						cells[writeIdx++] = commonStringChunks['default'];
					}
				} else if (is(colValue, SQL)) {
					cells[writeIdx++] = colValue;
				} else {
					if (col.defaultFn) {
						generatedIds[fieldName] = colValue;
					}
					cells[writeIdx++] = colValue;
				}
			}

			generatedIdsResponse.push(generatedIds);
		}

		valuesSqlList = [new ValueRows(cells, colEntries.map(([, col]) => col))];

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

	buildRelationalQuery(
		config: Omit<SingleStoreBuildRelationalQueryConfig, 'through'>,
	): BuildRelationalQueryResultWithOrder {
		const chunks: SQLChunk[] = [];
		const { selection, order } = this.collectRelationalQuery(config, chunks);

		return {
			sql: new SQL(chunks),
			selection,
			order,
		};
	}

	/** Pushes relational query's chunks to `collectTo`, returns its selection and order */
	private collectRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		errorPath,
		depth,
		isNestedMany,
		through,
		nested,
		withSubqueries,
	}: SingleStoreBuildRelationalQueryConfig, collectTo: SQLChunk[]): Omit<BuildRelationalQueryResultWithOrder, 'sql'> {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		const subqueries: RelationalWithSubqueries = withSubqueries ?? new Map();
		if (!currentDepth) {
			collectRelationalSubquery(subqueries, table);
			table = aliasedTable(table, `d${currentDepth}`);
		}

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const { sql: where } = relationalQueryWhereToSQL(
			table,
			params,
			tableConfig.relations,
			schema,
			subqueries,
			relationWhere,
		);
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy, tableConfig.relations, schema, subqueries)
			: undefined;

		const withParam = params ? (params as WithContainer).with : undefined;
		const withKeys: string[] = [];
		if (withParam) {
			for (const key of Object.keys(withParam)) {
				if (withParam[key]) withKeys.push(key);
			}
		}

		// Reserved for `with` clause, filled once all subqueries are collected
		const withIdx = currentDepth ? -1 : collectTo.length;
		if (!currentDepth) collectTo.push(undefined);

		collectTo.push(commonStringChunks['select ']);
		const hasColumns = buildRqbColumns(
			table,
			tableConfig.table[TableColumns],
			selection,
			!!nested,
			tableConfig.name,
			this.codecs,
			collectTo,
			params?.columns,
		);
		let selected = hasColumns ? 1 : 0;
		if (params?.extras) {
			const mark = collectTo.length;
			if (selected) collectTo.push(commonStringChunks[', ']);
			const extras = relationExtrasToSQL(table, params.extras, this.codecs, nested, collectTo);
			selection.push(...extras.selection);
			if (extras.sql) ++selected;
			else collectTo.length = mark;
		}
		for (const k of withKeys) {
			const relation = tableConfig.relations[k];
			if (!relation) throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });

			const key = sql.identifier(k);
			if (selected++) collectTo.push(commonStringChunks[', ']);
			if (relation.relationType === 'one') {
				collectTo.push(key, rqbChunks.relationField, key);
			} else {
				collectTo.push(rqbChunks.coalesceOpen, key, rqbChunks.relationFieldMany, key);
			}
		}

		if (!selected) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}

		if (isNestedMany && order) {
			collectTo.push(rqbChunks.rowNumber, ...order, rqbChunks.rowNumberAs);
		}

		collectTo.push(commonStringChunks[' from ']);
		getTableAsAliasSQL(table, collectTo);
		if (through) {
			collectTo.push(commonStringChunks[' inner join ']);
			getTableAsAliasSQL(through.table, collectTo);
			collectTo.push(commonStringChunks[' on '], ...through.condition);
		}

		for (const k of withKeys) {
			const join = withParam![k]!;
			const relation = tableConfig.relations[k]!;
			const isSingle = relation.relationType === 'one';
			collectRelationalSubquery(subqueries, relation.targetTable);
			collectRelationalSubquery(subqueries, relation.throughTable);

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

			collectTo.push(rqbChunks.joinOpen);
			// Reserved for JSON object of relation's fields, known once relation's query is built
			const jsonIdx = collectTo.length;
			collectTo.push(undefined, rqbChunks.joinFrom);
			const inner = this.collectRelationalQuery({
				table: targetTable,
				mode: isSingle ? 'first' : 'many',
				schema,
				queryConfig: join as DBQueryConfig,
				tableConfig: schema[relation.targetTableName]!,
				relationWhere: filter,
				errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
				depth: currentDepth + 1,
				withSubqueries: subqueries,
				isNestedMany: !isSingle,
				through: throughTable ? { table: throughTable, condition: joinCondition! } : undefined,
				nested: true,
			}, collectTo);
			collectTo.push(rqbChunks.joinClose, sql.identifier(k), rqbChunks.onTrue);

			const jsonChunks: SQLChunk[] = [isSingle ? rqbChunks.jsonObjectOpen : rqbChunks.jsonAggOpen];
			for (let i = 0; i < inner.selection.length; ++i) {
				const key = inner.selection[i]!.key;
				if (i) jsonChunks.push(commonStringChunks[', ']);
				jsonChunks.push(new StringChunk(this.escapeString(key)), commonStringChunks[', '], sql.identifier(key));
			}
			jsonChunks.push(commonStringChunks[')']);
			if (!isSingle) {
				if (inner.order) jsonChunks.push(rqbChunks.aggOrder);
				jsonChunks.push(commonStringChunks[')']);
			}
			collectTo[jsonIdx] = new SQL(jsonChunks);

			selection.push({
				field: targetTable,
				fieldType: 'Nested',
				key: k,
				selection: inner.selection,
				isArray: !isSingle,
				isOptional: ((relation as AnyOne).optional ?? false)
					|| (join !== true
						&& !!(join as Exclude<typeof join, boolean | undefined>)
							.where),
			});
		}

		if (where) collectTo.push(commonStringChunks[' where '], ...where);
		if (order) collectTo.push(commonStringChunks[' order by '], ...order);
		if (limit !== undefined) collectTo.push(commonStringChunks[' limit '], limit as SQLChunk);
		if (offset !== undefined) collectTo.push(commonStringChunks[' offset '], offset as SQLChunk);

		if (withIdx !== -1) collectTo[withIdx] = this.buildWithCTE([...subqueries.values()]);

		return { selection, order };
	}
}
