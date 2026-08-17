import * as V1 from '~/_relations.ts';
import {
	aliasedTable,
	aliasedTableColumn,
	getOriginalColumnFromAlias,
	mapColumnsInAliasedSQLToAlias,
	mapColumnsInSQLToAlias,
} from '~/alias.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { Param, type Query, SQL, sql, type SQLChunk, StringChunk, View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, getTableUniqueName, Table } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/mssql.ts';
import { makeDefaultQueryMapper, makeJitQueryMapper, type RowsMapperGenerator, type UpdateSet } from '~/utils.ts';
import { and, DrizzleError, eq, type Name, ViewBaseConfig } from '../index.ts';
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
}

export class MsSqlDialect {
	static readonly [entityKind]: string = 'MsSqlDialect';

	readonly mapperGenerators: {
		rows: RowsMapperGenerator;
	};

	constructor(config?: MsSqlDialectConfig) {
		this.mapperGenerators = {
			rows: config?.useJitMappers ? makeJitQueryMapper : makeDefaultQueryMapper,
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

	buildDeleteQuery({ table, where, output }: MsSqlDeleteConfig): SQL {
		const outputSql = output
			? sql` output ${this.buildSelectionOutput(output, { type: 'DELETED' })}`
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

	buildUpdateQuery({ table, set, where, output }: MsSqlUpdateConfig): SQL {
		const setSql = this.buildUpdateSet(table, set);

		const outputSql = sql``;

		if (output) {
			outputSql.append(sql` output `);

			if (output.inserted) {
				outputSql.append(
					this.buildSelectionOutput(output.inserted, { type: 'INSERTED' }),
				);
			}

			if (output.deleted) {
				if (output.inserted) outputSql.append(sql`, `); // add space if both are present
				outputSql.append(
					this.buildSelectionOutput(output.deleted, { type: 'DELETED' }),
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
	 */
	private buildSelection(
		fields: SelectedFieldsOrdered,
		{ isSingleTable = false, table }: {
			isSingleTable?: boolean;
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
			const { field, fieldType } = fields[i]!;

			switch (fieldType) {
				case 'Column': {
					if (isSingleTable) {
						chunks.push(
							field.isAlias
								? sql`${sql.identifier(getOriginalColumnFromAlias(field).name)} as ${field}`
								: sql.identifier(field.name),
						);
					} else {
						chunks.push(
							field.isAlias
								? sql`${getOriginalColumnFromAlias(field)} as ${field}`
								: field,
						);
					}

					break;
				}
				case 'SQL.Aliased': {
					if (field.isSelectionField) {
						if (!isSingleTable && field.origin !== undefined) {
							chunks.push(sql.identifier(field.origin), new StringChunk('.'));
						}
						chunks.push(sql.identifier(field.fieldAlias));
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
								chunks.push(field.sql);
							} else {
								const newSql = new SQL(newChunks);
								if (field.sql.shouldInlineParams) newSql.inlineParams();
								chunks.push(newSql);
							}
						} else {
							chunks.push(field.sql);
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
							chunks.push(field);
						} else {
							const newSql = new SQL(newChunks);
							if (field.shouldInlineParams) newSql.inlineParams();
							chunks.push(newSql);
						}
					} else chunks.push(field);

					break;
				}
				case 'Subquery': {
					if (!field._.isWith) {
						chunks.push(sql`(${field._.sql}) ${sql.identifier(field._.alias)}`);
					} else {
						chunks.push(field);
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

	private buildSelectionOutput(
		fields: SelectedFieldsOrdered,
		{ type }: { type: 'INSERTED' | 'DELETED' },
	): SQL {
		const { length: columnsLen } = fields;
		const chunks: SQLChunk[] = [];

		for (let i = 0; i < columnsLen; ++i) {
			const { field, fieldType } = fields[i]!;

			switch (fieldType) {
				case 'Column': {
					chunks.push(
						sql.join([
							new StringChunk(`${type}.`),
							field.isAlias
								? sql`${sql.identifier(getOriginalColumnFromAlias(field).name)} as ${field}`
								: sql.identifier(field.name),
						]),
					);

					break;
				}
				case 'SQL.Aliased': {
					if (field.isSelectionField) {
						chunks.push(
							sql.join([new StringChunk(`${type}.`), sql.identifier(field.fieldAlias)]),
						);
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

		const selection = this.buildSelection(fieldsList, { isSingleTable, table });

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
			return this.buildSetOperations(finalQuery, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		setOperators: MsSqlSelectConfig['setOperators'],
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
		setOperator: { type, isAll, rightSelect, fetch, orderBy, offset },
	}: {
		leftSelect: SQL;
		setOperator: MsSqlSelectConfig['setOperators'][number];
	}): SQL {
		const leftChunk = sql`(${leftSelect.getSQL()}) `;
		const rightChunk = sql`(${rightSelect.getSQL()})`;

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

			orderBySql = sql` order by ${sql.join(orderByValues, new StringChunk(', '))} `;
		}

		const offsetSql = offset === undefined ? undefined : sql` offset ${offset} rows`;

		const fetchSql = fetch === undefined ? undefined : sql` fetch next ${fetch} rows only`;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${offsetSql}${fetchSql}`;
	}

	buildInsertQuery({ table, values: valuesOrSelect, output, columnList, select }: MsSqlInsertConfig): SQL {
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
			? sql` output ${this.buildSelectionOutput(output, { type: 'INSERTED' })}`
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
			invokeSource,
		});
		return res;
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
		schema: V1.TablesRelationalConfig;
		tableNamesMap: Record<string, string>;
		table: MsSqlTable;
		tableConfig: V1.TableRelationalConfig;
		queryConfig: true | V1.DBQueryConfig<'many', true>;
		tableAlias: string;
		nestedQueryRelation?: V1.Relation;
		joinOn?: SQL;
	}): V1.BuildRelationalQueryResult<MsSqlTable, MsSqlColumn> {
		let selection: V1.BuildRelationalQueryResult<
			MsSqlTable,
			MsSqlColumn
		>['selection'] = [];
		let limit,
			offset,
			orderBy: MsSqlSelectConfig['orderBy'] = [],
			where;

		if (config === true) {
			const selectionEntries = Object.entries(tableConfig.columns);
			selection = selectionEntries.map(([key, value]) => ({
				dbKey: value.name,
				tsKey: key,
				field: aliasedTableColumn(value as MsSqlColumn, tableAlias),
				relationTableTsKey: undefined,
				isJson: false,
				selection: [],
			}));
		} else {
			const aliasedColumns = Object.fromEntries(
				Object.entries(tableConfig.columns).map(([key, value]) => [
					key,
					aliasedTableColumn(value, tableAlias),
				]),
			);

			if (config.where) {
				const whereSql = typeof config.where === 'function'
					? config.where(aliasedColumns, V1.getOperators())
					: config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}

			const fieldsSelection: {
				tsKey: string;
				value: MsSqlColumn | SQL.Aliased;
			}[] = [];
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
						: Object.keys(tableConfig.columns).filter(
							(key) => !selectedColumns.includes(key),
						);
				}
			} else {
				// Select all columns if selection is not specified
				selectedColumns = Object.keys(tableConfig.columns);
			}

			for (const field of selectedColumns) {
				const column = tableConfig.columns[field]! as MsSqlColumn;
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
					.filter(
						(
							entry,
						): entry is [(typeof entry)[0], NonNullable<(typeof entry)[1]>] => !!entry[1],
					)
					.map(([tsKey, queryConfig]) => ({
						tsKey,
						queryConfig,
						relation: tableConfig.relations[tsKey]!,
					}));
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
					dbKey: is(value, SQL.Aliased)
						? value.fieldAlias
						: tableConfig.columns[tsKey]!.name,
					tsKey,
					field: is(value, Column)
						? aliasedTableColumn(value, tableAlias)
						: value,
					relationTableTsKey: undefined,
					isJson: false,
					selection: [],
				});
			}

			let orderByOrig = typeof config.orderBy === 'function'
				? config.orderBy(aliasedColumns, V1.getOrderByOperators())
				: (config.orderBy ?? []);
			if (!Array.isArray(orderByOrig)) {
				orderByOrig = [orderByOrig];
			}
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) {
					return aliasedTableColumn(orderByValue, tableAlias) as MsSqlColumn;
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
				const normalizedRelation = V1.normalizeRelation(
					schema,
					tableNamesMap,
					relation,
				);
				const relationTableName = getTableUniqueName(relation.referencedTable);
				const relationTableTsName = tableNamesMap[relationTableName]!;
				const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
				const joinOn = and(
					...normalizedRelation.fields.map((field, i) =>
						eq(
							aliasedTableColumn(
								normalizedRelation.references[i]!,
								relationTableAlias,
							),
							aliasedTableColumn(field, tableAlias),
						)
					),
				);
				const builtRelation = this.buildRelationalQuery({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName] as MsSqlTable,
					tableConfig: schema[relationTableTsName]!,
					queryConfig: is(relation, V1.One)
						? selectedRelationConfigValue === true
							? { limit: 1 }
							: { ...selectedRelationConfigValue, limit: 1 }
						: selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn,
					nestedQueryRelation: relation,
				});
				let fieldSql = sql`(${builtRelation.sql} for json auto, include_null_values)${
					nestedQueryRelation
						? sql` as ${sql.identifier(relationTableAlias)}`
						: undefined
				}`;
				if (is(relation, V1.Many)) {
					fieldSql = sql`${fieldSql}`;
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
			let field = sql`${
				sql.join(
					selection.map((sel) => {
						return is(sel.field, MsSqlColumn)
							? sql.identifier(sel.field.name)
							: is(sel.field, SQL.Aliased)
							? sel.isJson
								? sel.field.sql
								: sql`${sel.field.sql} as ${sql.identifier(sel.field.fieldAlias)}`
							: sel.field;
					}),
					new StringChunk(', '),
				)
			}`;
			if (is(nestedQueryRelation, V1.Many)) {
				field = sql`${field}`;
			}
			const nestedSelection = [
				{
					dbKey: 'data',
					tsKey: 'data',
					field,
					isJson: true,
					relationTableTsKey: tableConfig.tsName,
					selection,
				},
			];

			result = aliasedTable(table, tableAlias);

			const top = offset ? undefined : (limit ?? undefined);
			const fetch = offset && limit ? limit : undefined;

			// Mssql required order by to be present in the query if using offset and fetch(limit)
			// With order by 1, the query will be ordered by the first column in the selection
			if (orderBy.length === 0 && offset !== undefined && fetch !== undefined) {
				orderBy = [sql`1`];
			}

			result = this.buildSelectQuery({
				table: is(result, MsSqlTable)
					? result
					: new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: nestedSelection.map(({ field }) => {
					const mapped = is(field, Column) ? aliasedTableColumn(field, tableAlias) : field;
					const fieldType = is(mapped, Column) ? 'Column' : is(mapped, SQL.Aliased) ? 'SQL.Aliased' : 'SQL';
					return { path: [], field: mapped, fieldType } as SelectedFieldsOrdered[number];
				}),
				where,
				top,
				offset,
				fetch,
				orderBy,
				setOperators: [],
			});
		} else {
			const top = offset ? undefined : (limit ?? undefined);
			const fetch = offset && limit ? limit : undefined;

			if (orderBy.length === 0 && offset !== undefined && fetch !== undefined) {
				orderBy = [sql`1`];
			}
			result = this.buildSelectQuery({
				table: aliasedTable(table, tableAlias),
				fields: {},
				fieldsFlat: selection.map(({ field }) => {
					const mapped = is(field, Column) ? aliasedTableColumn(field, tableAlias) : field;
					const fieldType = is(mapped, Column) ? 'Column' : is(mapped, SQL.Aliased) ? 'SQL.Aliased' : 'SQL';
					return { path: [], field: mapped, fieldType } as SelectedFieldsOrdered[number];
				}),
				where,
				top,
				offset,
				fetch,
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
