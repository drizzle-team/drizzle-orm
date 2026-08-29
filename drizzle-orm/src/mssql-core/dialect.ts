import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { MsSqlCustomColumn } from '~/mssql-core/columns/custom.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	AnyOne,
	BuildRelationalQueryResult,
	ColumnWithTSName,
	DBQueryConfigWithComment,
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
import {
	isSQLWrapper,
	Param,
	type Query,
	SQL,
	sql,
	type SQLChunk,
	type SQLWrapper,
	StringChunk,
	View,
} from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/mssql.ts';
import { makeDefaultQueryMapper, makeJitQueryMapper, type RowsMapperGenerator, type UpdateSet } from '~/utils.ts';
import { and, DrizzleError, type Name, ViewBaseConfig } from '../index.ts';
import { type MsSqlCodecs, type MsSqlType, resolveMsSqlTypeAlias } from './codecs.ts';
import { MsSqlColumn } from './columns/common.ts';
import type { MsSqlDeleteConfig } from './query-builders/delete.ts';
import type { MsSqlInsertConfig } from './query-builders/insert.ts';
import type {
	AnyMsSqlSelectQueryBuilder,
	MsSqlSelectConfig,
	SelectedFieldsOrdered,
} from './query-builders/select.types.ts';
import type { MsSqlUpdateConfig } from './query-builders/update.ts';
import type { MsSqlSession } from './session.ts';
import { MsSqlTable } from './table.ts';
import { MsSqlViewBase } from './view-base.ts';

export interface MsSqlDialectConfig {
	useJitMappers?: boolean;
	codecs?: MsSqlCodecs;
}

export class MsSqlDialect {
	static readonly [entityKind]: string = 'MsSqlDialect';

	readonly codecs: CodecsCollection<MsSqlType>;
	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
		relationalRows: RelationalRowsMapperGenerator;
	};

	constructor(config?: MsSqlDialectConfig) {
		this.codecs = new CodecsCollection<MsSqlType>(resolveMsSqlTypeAlias, config?.codecs);
		this.mapperGenerators = config?.useJitMappers
			? {
				rows: makeJitQueryMapper,
				relationalRows: makeJitRqbMapper,
			}
			: {
				rows: makeDefaultQueryMapper,
				relationalRows: makeDefaultRqbMapper,
			};
	}

	async migrate(
		migrations: MigrationMeta[],
		session: MsSqlSession,
		config: MigrationConfig,
	): Promise<void | MigratorInitFailResponse> {
		const migrationsSchema = typeof config === 'string'
			? 'drizzle'
			: (config.migrationsSchema ?? 'drizzle');

		const migrationSchemaCreate = sql`
			IF NOT EXISTS (
				SELECT 1 FROM sys.schemas WHERE name = ${migrationsSchema}
			)
			EXEC(\'CREATE SCHEMA ${sql.identifier(migrationsSchema)}\')
		`;

		await session.execute(migrationSchemaCreate);

		const migrationsTable = typeof config === 'string'
			? '__drizzle_migrations'
			: (config.migrationsTable ?? '__drizzle_migrations');

		// Detect DB version and upgrade table schema if needed
		const { newDb } = await upgradeIfNeeded(
			migrationsSchema,
			migrationsTable,
			session,
			migrations,
		);

		if (newDb) {
			const migrationTableCreate = sql`
			IF NOT EXISTS (
				SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
				WHERE TABLE_NAME = ${migrationsTable} AND TABLE_SCHEMA = ${migrationsSchema}
			)
			CREATE TABLE ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id bigint identity PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at datetime2 NOT NULL DEFAULT GETUTCDATE()
			)
		`;

			await session.execute(migrationTableCreate);
		}

		const dbMigrations = (
			await session.execute<{
				recordset: {
					id: number;
					hash: string;
					created_at: string;
					name: string | null;
				}[];
			}>(
				sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${
					sql.identifier(
						migrationsTable,
					)
				}`,
			)
		).recordset;

		if (typeof config === 'object' && config.init) {
			if (dbMigrations.length > 0) {
				return { exitCode: 'databaseMigrations' as const };
			}

			if (migrations.length > 1) {
				return { exitCode: 'localMigrations' as const };
			}

			const [migration] = migrations;

			if (!migration) return;

			await session.execute(
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(
						migrationsTable,
					)
				} ([hash], [created_at], [name]) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
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
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(
							migrationsTable,
						)
					} ([hash], [created_at], [name]) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
				);
			}
		});
	}

	escapeName(name: string): string {
		return `[${name.replace(/\]/g, ']]')}]`;
	}

	escapeParam(_num: number): string {
		return `@par${_num}`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
	}

	buildDeleteQuery({ table, where, output, ignoreSelectionCastCodecs }: MsSqlDeleteConfig): SQL {
		const outputSql = output
			? sql` output ${
				this.buildSelectionOutput(output, { type: 'DELETED', ignoreCastCodecs: ignoreSelectionCastCodecs })
			}`
			: undefined;

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`delete from ${table}${outputSql}${whereSql}`;
	}

	buildUpdateSet(table: MsSqlTable, set: UpdateSet): SQL {
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
		// const setEntries = Object.entries(set);
		//
		// const setSize = setEntries.length;
		// return sql.join(
		// 	setEntries
		// 		.flatMap(([colName, value], i): SQL[] => {
		// 			const col: MsSqlColumn = table[Table.Symbol.Columns][colName]!;
		// 			const res = sql`${sql.identifier(col.name)} = ${value}`;
		// 			if (i < setSize - 1) {
		// 				return [res, sql.raw(', ')];
		// 			}
		// 			return [res];
		// 		}),
		// );
	}

	buildUpdateQuery({ table, set, where, output, ignoreSelectionCastCodecs }: MsSqlUpdateConfig): SQL {
		const setSql = this.buildUpdateSet(table, set);

		const outputSql = sql``;

		if (output) {
			outputSql.append(sql` output `);

			if (output.inserted) {
				outputSql.append(
					this.buildSelectionOutput(output.inserted, {
						type: 'INSERTED',
						ignoreCastCodecs: ignoreSelectionCastCodecs,
					}),
				);
			}

			if (output.deleted) {
				if (output.inserted) outputSql.append(sql`, `); // add space if both are present
				outputSql.append(
					this.buildSelectionOutput(output.deleted, {
						type: 'DELETED',
						ignoreCastCodecs: ignoreSelectionCastCodecs,
					}),
				);
			}
		}

		const whereSql = where ? sql` where ${where}` : undefined;

		return sql`update ${table} set ${setSql}${outputSql}${whereSql}`;
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
	 * @internal
	 */
	private buildSelection(
		fields: SelectedFieldsOrdered,
		{ isSingleTable = false, ignoreCastCodecs = false, table }: {
			isSingleTable?: boolean;
			ignoreCastCodecs?: boolean;
			table?: MsSqlTable | MsSqlViewBase | SQL | Subquery;
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
			const override = codecOverride as MsSqlType | undefined;

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

	/** @internal */
	private buildSelectionOutput(
		fields: SelectedFieldsOrdered,
		{ type, ignoreCastCodecs = false }: { type: 'INSERTED' | 'DELETED'; ignoreCastCodecs?: boolean },
	): SQL {
		const { length: columnsLen } = fields;
		const chunks: SQLChunk[] = [];

		for (let i = 0; i < columnsLen; ++i) {
			const { field, fieldType, column, codecOverride } = fields[i]!;
			const override = codecOverride as MsSqlType | undefined;

			switch (fieldType) {
				case 'Column': {
					const name = sql`${new StringChunk(`${type}.`)}${
						sql.identifier(field.isAlias ? getOriginalColumnFromAlias(field).name : field.name)
					}`;
					const casted = ignoreCastCodecs ? name : this.codecs.apply(field, 'cast', name, override);

					chunks.push(field.isAlias ? sql`${casted} as ${field}` : casted);

					break;
				}
				case 'SQL.Aliased': {
					if (field.isSelectionField) {
						const query = sql`${new StringChunk(`${type}.`)}${sql.identifier(field.fieldAlias)}`;

						if (column && !ignoreCastCodecs) chunks.push(this.codecs.apply(column, 'cast', query, override));
						else chunks.push(query);
					} else {
						const query = field.sql;

						chunks.push(
							new SQL(
								query.queryChunks.map((c) => {
									if (is(c, MsSqlColumn)) {
										return sql.join([
											new StringChunk(`${type}.`),
											sql.identifier(c.name),
										]);
									}
									return c;
								}),
							),
						);

						chunks.push(sql` as ${sql.identifier(field.fieldAlias)}`);
					}

					break;
				}
				case 'SQL': {
					const query = field;

					chunks.push(
						new SQL(
							query.queryChunks.map((c) => {
								if (is(c, MsSqlColumn)) {
									return sql.join([
										new StringChunk(`${type}.`),
										sql.identifier(c.name),
									]);
								}
								return c;
							}),
						),
					);

					break;
				}
			}

			if (i < columnsLen - 1) {
				chunks.push(new StringChunk(', '));
			}
		}

		return new SQL(chunks);
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
		fetch,
		for: _for,
		top,
		offset,
		distinct,
		setOperators,
		ignoreSelectionCastCodecs,
	}: MsSqlSelectConfig): SQL {
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
						: is(table, MsSqlViewBase)
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

		let withSql: SQL | undefined;
		if (withList?.length) {
			const withListLen = withList.length;
			const withSqlChunks: SQLChunk[] = new Array(withListLen + 1);
			let writeIdx = 0;
			withSqlChunks[writeIdx++] = new StringChunk('with ');

			for (let i = 0; i < withListLen; ++i) {
				const w = withList[i]!;
				withSqlChunks[writeIdx++] = (i < withListLen - 1)
					? sql`${sql.identifier(w._.alias)} as (${w._.sql}), `
					: sql`${sql.identifier(w._.alias)} as (${w._.sql}) `;
			}

			withSql = new SQL(withSqlChunks);
		}

		const distinctSql = distinct ? sql` distinct` : undefined;

		const topSql = top ? sql` top(${top})` : undefined;

		const selection = this.buildSelection(fieldsList, {
			isSingleTable,
			table,
			ignoreCastCodecs: ignoreSelectionCastCodecs || setOperators.length > 0,
		});

		const tableSql = (() => {
			if (
				is(table, Table)
				&& table[Table.Symbol.OriginalName] !== table[Table.Symbol.Name]
			) {
				let fullName = sql`${sql.identifier(table[Table.Symbol.OriginalName])} ${
					sql.identifier(
						table[Table.Symbol.Name],
					)
				}`;
				if (table[Table.Symbol.Schema]) {
					fullName = sql`${sql.identifier(table[Table.Symbol.Schema]!)}.${fullName}`;
				}
				return fullName;
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
				const joinKeyword = joinMeta.lateral
					? new StringChunk(joinMeta.joinType === 'left' ? 'outer apply' : 'cross apply')
					: new StringChunk(`${joinMeta.joinType} join`);
				const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : undefined;

				if (is(table, MsSqlTable)) {
					const tableName = table[MsSqlTable.Symbol.Name];
					const tableSchema = table[MsSqlTable.Symbol.Schema];
					const origTableName = table[MsSqlTable.Symbol.OriginalName];
					const alias = tableName === origTableName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${joinKeyword} ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : undefined}${
							sql.identifier(origTableName)
						}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else if (is(table, View)) {
					const viewName = table[ViewBaseConfig].name;
					const viewSchema = table[ViewBaseConfig].schema;
					const origViewName = table[ViewBaseConfig].originalName;
					const alias = viewName === origViewName ? undefined : joinMeta.alias;
					joinsArray.push(
						sql`${joinKeyword} ${viewSchema ? sql`${sql.identifier(viewSchema)}.` : undefined}${
							sql.identifier(origViewName)
						}${alias && sql` ${sql.identifier(alias)}`}${onSql}`,
					);
				} else {
					joinsArray.push(
						sql`${joinKeyword} ${table}${onSql}`,
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

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			orderBySql = sql` order by ${sql.join(orderBy, new StringChunk(', '))}`;
		}

		let groupBySql;
		if (groupBy && groupBy.length > 0) {
			groupBySql = sql` group by ${sql.join(groupBy, new StringChunk(', '))}`;
		}

		const offsetSql = offset === undefined ? undefined : sql` offset ${offset} rows`;

		const fetchSql = fetch === undefined ? undefined : sql` fetch next ${fetch} rows only`;

		let forSQL: SQL | undefined;
		if (_for && _for.mode === 'json') {
			forSQL = sql` for json ${new StringChunk(_for.type)}${
				_for.options?.root
					? sql` root(${sql.identifier(_for.options.root)})`
					: undefined
			}${_for.options?.includeNullValues ? sql` include_null_values` : undefined}${
				_for.options?.withoutArrayWrapper
					? sql` without_array_wrapper`
					: undefined
			}`;
		}

		const finalQuery =
			sql`${withSql}select${distinctSql}${topSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${offsetSql}${fetchSql}${forSQL}`;

		if (setOperators.length > 0) {
			return this.buildSetOperations(finalQuery, fieldsList, ignoreSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		ignoreSelectionCastCodecs: boolean | undefined,
		setOperators: MsSqlSelectConfig['setOperators'],
	): SQL {
		const lastIdx = setOperators.length - 1;
		let tailSql: SQL | undefined;

		for (let i = 0; i <= lastIdx; ++i) {
			const setOperator = setOperators[i]!;

			const hoistTail = !ignoreSelectionCastCodecs && i === lastIdx;
			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator, omitTail: hoistTail });
			if (hoistTail) tailSql = this.buildSetOperationTail(setOperator);
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
		} from (${leftSelect}) ${sql.identifier('drizzle_union')}${tailSql}`;
	}

	buildSetOperationTail(
		{ orderBy, offset, fetch }: MsSqlSelectConfig['setOperators'][number],
	): SQL | undefined {
		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues: (SQL<unknown> | Name)[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MsSql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderByUnit of orderBy) {
				if (is(orderByUnit, MsSqlColumn)) {
					orderByValues.push(sql.identifier(orderByUnit.name));
				} else if (is(orderByUnit, SQL)) {
					for (let i = 0; i < orderByUnit.queryChunks.length; i++) {
						const chunk = orderByUnit.queryChunks[i];

						if (is(chunk, MsSqlColumn)) {
							orderByUnit.queryChunks[i] = sql.identifier(chunk.name);
						}
					}

					orderByValues.push(sql`${orderByUnit}`);
				} else {
					orderByValues.push(sql`${orderByUnit}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, new StringChunk(', '))}`;
		}

		const offsetSql = offset === undefined ? undefined : sql` offset ${offset} rows`;

		const fetchSql = fetch === undefined ? undefined : sql` fetch next ${fetch} rows only`;

		if (orderBySql === undefined && offsetSql === undefined && fetchSql === undefined) return undefined;

		return sql`${orderBySql}${offsetSql}${fetchSql}`;
	}

	buildSetOperationQuery({
		leftSelect,
		setOperator,
		omitTail,
	}: {
		leftSelect: SQL;
		setOperator: MsSqlSelectConfig['setOperators'][number];
		omitTail?: boolean;
	}): SQL {
		const { type, isAll, rightSelect } = setOperator;
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.withoutSelectionCastCodecs().getSQL()})`;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);
		const tailSql = omitTail ? undefined : this.buildSetOperationTail(setOperator);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${tailSql}`;
	}

	buildInsertQuery(
		{ table, values: valuesOrSelect, output, columnList, select, ignoreSelectionCastCodecs }: MsSqlInsertConfig,
	): SQL {
		const columns: Record<string, MsSqlColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, MsSqlColumn][] = select && !is(valuesOrSelect, SQL)
			? Object
				.keys((valuesOrSelect as TypedQueryBuilder<any>).getSelectedFields())
				.map((key) => [key, columns[key]!] as [string, MsSqlColumn])
			: columnList
			? columnList.map((name) => [name, columns[name]!] as [string, MsSqlColumn])
			: Object.entries(columns).filter(
				([_, col]) => !col.shouldDisableInsert(),
			);

		if (colEntries.length === 0 && !select && (valuesOrSelect as Record<string, unknown>[]).length > 1) {
			throw new DrizzleError({
				message: `Cannot insert ${(valuesOrSelect as Record<string, unknown>[]).length} rows into "${
					table[Table.Symbol.Name]
				}": it has no insertable columns, so only a single all-defaults row can be inserted per statement`,
			});
		}

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

		const valuesSqlList: SQLChunk[] = Array.from({
			length: select ? 1 : (colEntries.length * 2 + 1) * (valuesOrSelect as Record<string, unknown>[]).length
				+ (valuesOrSelect as Record<string, unknown>[]).length - 1,
		});

		if (select) {
			valuesSqlList[0] = (valuesOrSelect as AnyMsSqlSelectQueryBuilder | SQL).getSQL();
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];

			let writeIdx = 0;

			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;

				valuesSqlList[writeIdx++] = new StringChunk('(');
				for (let i = 0; i < colEntries.length; ++i) {
					const [fieldName, col] = colEntries[i]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						if (col.defaultFn !== undefined) {
							const defaultFnResult = col.defaultFn();
							const defaultValue = is(defaultFnResult, SQL)
								? defaultFnResult
								: sql.param(defaultFnResult, col);
							valuesSqlList[writeIdx++] = defaultValue;
						} else if (!col.default && col.onUpdateFn !== undefined) {
							const onUpdateFnResult = col.onUpdateFn();
							const newValue = is(onUpdateFnResult, SQL)
								? onUpdateFnResult
								: sql.param(onUpdateFnResult, col);
							valuesSqlList[writeIdx++] = newValue;
						} else {
							valuesSqlList[writeIdx++] = new StringChunk(`default`);
						}
					} else {
						valuesSqlList[writeIdx++] = is(colValue, SQL) ? colValue : new Param(colValue, col);
					}

					if (i < colEntries.length - 1) {
						valuesSqlList[writeIdx++] = new StringChunk(', ');
					}
				}

				valuesSqlList[writeIdx++] = new StringChunk(')');

				if (valueIndex < values.length - 1) {
					valuesSqlList[writeIdx++] = new StringChunk(`, `);
				}
			}
		}

		const outputSql = output
			? sql` output ${
				this.buildSelectionOutput(output, { type: 'INSERTED', ignoreCastCodecs: ignoreSelectionCastCodecs })
			}`
			: undefined;

		if (select) {
			return sql`insert into ${table} ${insertOrder}${outputSql} ${new SQL(valuesSqlList)}`;
		}

		if (colEntries.length === 0) {
			return sql`insert into ${table}${outputSql} default values`;
		}

		return sql`insert into ${table} ${insertOrder}${outputSql} values ${new SQL(valuesSqlList)}`;
	}

	sqlToQuery(
		sql: SQL,
		invokeSource?: 'indexes' | 'mssql-check' | 'mssql-view-with-schemabinding',
	): Query {
		const res = sql.toQuery({
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			codecs: this.codecs,
			invokeSource,
		});
		return res;
	}

	/** @internal */
	private buildRqbColumn(
		table: Table | View,
		field: unknown,
		key: string,
		inJson: boolean,
		selection: BuildRelationalQueryResult['selection'],
		tableTsName: string,
	) {
		let decoderColumn: Column | undefined;
		let fieldType: BuildRelationalQueryResult['selection'][number]['fieldType'];
		let output: SQL;

		if (is(field, Column)) {
			decoderColumn = field;
			fieldType = 'Column';

			const name = sql`${table}.${sql.identifier(field.name)}`;
			const casted = inJson && (<MsSqlCustomColumn<any>> field).jsonSelectIdentifier
				? (<MsSqlCustomColumn<any>> field).jsonSelectIdentifier!(name, sql)
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
					codec: !inJson || !(<MsSqlCustomColumn<any>> decoderColumn).mapFromJsonValue
						? this.codecs.get(decoderColumn, inJson ? 'normalizeInJson' : 'normalize')
						: undefined,
				}
				: {
					key,
					field,
					fieldType,
				}) as BuildRelationalQueryResult['selection'][number],
		);

		return output;
	}

	/** @internal */
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
				selectedColumns.push({
					column: columnContainer[k]! as Column | SQL | SQLWrapper | SQL.Aliased,
					tsName: k,
				});
			}
		}

		if (colSelectionMode === false) {
			for (const [k, v] of Object.entries(columnContainer)) {
				if (columns[k] === false) continue;

				selectedColumns.push({
					column: v as Column | SQL | SQLWrapper | SQL.Aliased,
					tsName: k,
				});
			}
		}

		return selectedColumns;
	};

	/** @internal */
	private buildColumns = (
		table: Table | View,
		selection: BuildRelationalQueryResult['selection'],
		inJson: boolean,
		tableTsName: string,
		config?: DBQueryConfigWithComment<'many'>,
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
		const selectedColumns = this.getSelectedTableColumns(table, config.columns);

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
		throughJoin,
		nested,
	}: {
		schema: TablesRelationalConfig;
		table: MsSqlTable | MsSqlViewBase;
		tableConfig: TableRelationalConfig;
		queryConfig?: DBQueryConfigWithComment<'many'> | true;
		relationWhere?: SQL;
		mode: 'first' | 'many';
		errorPath?: string;
		depth?: number;
		throughJoin?: SQL;
		nested?: boolean;
	}): BuildRelationalQueryResult {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		if (!currentDepth) table = aliasedTable(table, `d${currentDepth}`);

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const where: SQL | undefined = params && 'where' in params && relationWhere
			? and(
				relationsFilterToSQL(table, params.where, tableConfig.relations, schema),
				relationWhere,
			)
			: params && 'where' in params
			? relationsFilterToSQL(table, params.where, tableConfig.relations, schema)
			: relationWhere;
		const order = params?.orderBy ? relationsOrderToSQL(table, params.orderBy) : undefined;

		if (offset !== undefined && !order) {
			throw new DrizzleError({
				message: `Table "${tableConfig.name}"${
					currentPath ? ` ("${currentPath}")` : ''
				} uses "offset" without "orderBy". SQL Server only accepts "offset" as part of an "order by" clause.`,
			});
		}

		const columns = this.buildColumns(table, selection, !!nested, tableConfig.name, params);
		const extras = params?.extras ? relationExtrasToSQL(table, params.extras, this.codecs, nested) : undefined;
		if (extras) selection.push(...extras.selection);

		const selectionArr: SQL[] = [];
		if (columns) selectionArr.push(columns);
		if (extras?.sql) selectionArr.push(extras.sql);

		const applies: SQL[] = [];

		switch (params) {
			case undefined:
				break;
			default: {
				const { with: withParam } = params as WithContainer;
				if (!withParam) break;

				const withEntries = Object.entries(withParam).filter(([_, v]) => v);
				if (!withEntries.length) break;

				for (let i = 0; i < withEntries.length; ++i) {
					const [k, join] = withEntries[i]!;
					const relation = tableConfig.relations[k];
					if (!relation) throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });
					const isSingle = relation.relationType === 'one';
					const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`);
					const throughTable = relation.throughTable
						? (aliasedTable(relation.throughTable, `tr${currentDepth}`) as Table | View)
						: undefined;
					const { filter, joinCondition } = relationToSQL(relation, table, targetTable, throughTable);

					const nestedThroughJoin = throughTable
						? sql` inner join ${getTableAsAliasSQL(throughTable)} on ${joinCondition!}`
						: undefined;

					const innerQuery = this.buildRelationalQuery({
						table: targetTable as MsSqlTable | MsSqlViewBase,
						mode: isSingle ? 'first' : 'many',
						schema,
						queryConfig: join as DBQueryConfigWithComment,
						tableConfig: schema[relation.targetTableName]!,
						relationWhere: filter,
						errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
						depth: currentDepth + 1,
						throughJoin: nestedThroughJoin,
						nested: true,
					});

					selection.push({
						field: targetTable,
						fieldType: 'Nested',
						key: k,
						selection: innerQuery.selection,
						isArray: !isSingle,
						isOptional: ((relation as AnyOne).optional ?? false)
							|| (join !== true && !!(join as Exclude<typeof join, boolean | undefined>).where),
					});

					const forJson = isSingle
						? sql` for json path, include_null_values, without_array_wrapper`
						: sql` for json path, include_null_values`;

					const applyAlias = sql.identifier(`r${currentDepth}_${i}`);
					const jsonColumn = sql.identifier('j');
					applies.push(
						sql` outer apply (${innerQuery.sql}${forJson}) ${applyAlias}(${jsonColumn})`,
					);

					const jsonRef = sql`${applyAlias}.${jsonColumn}`;
					const jsonQuery = isSingle ? jsonRef : sql`coalesce(${jsonRef}, '[]')`;

					selectionArr.push(
						sql`${nested ? sql`json_query(${jsonQuery})` : jsonQuery} as ${sql.identifier(k)}`,
					);
				}

				break;
			}
		}

		if (!selectionArr.length) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}
		const selectionSet = sql.join(selectionArr, new StringChunk(', '));

		const useOffset = offset !== undefined;
		const top = !useOffset && limit !== undefined ? sql` top(${limit})` : undefined;

		const query = sql`select${top} ${selectionSet} from ${getTableAsAliasSQL(table)}${throughJoin}${
			applies.length ? sql.join(applies) : undefined
		}${where ? sql` where ${where}` : undefined}${order ? sql` order by ${order}` : undefined}${
			useOffset ? sql` offset ${offset} rows` : undefined
		}${useOffset && limit !== undefined ? sql` fetch next ${limit} rows only` : undefined}`;

		return {
			sql: query,
			selection,
		};
	}
}
