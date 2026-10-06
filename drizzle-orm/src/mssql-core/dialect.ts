import { aliasedTable, getOriginalColumnFromAlias } from '~/alias.ts';
import { CodecsCollection } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type {
	MigrationConfig,
	MigrationMeta,
	MigratorInitFailResponse,
	RollbackOptions,
	RollbackStep,
} from '~/migrator.ts';
import { getMigrationsToRun, journalReadError, type JournalRow, planRollback } from '~/migrator.utils.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	AnyOne,
	BuildRelationalQueryConfig,
	BuildRelationalQueryResult,
	DBQueryConfigRoot,
	RelationalRowsMapperGenerator,
	WithContainer,
} from '~/relations.ts';
import {
	buildRqbColumns,
	collectSubqueryAndUsedTables,
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
import { type Query, SQL, sql, type SQLChunk } from '~/sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk, unqualifyColumns } from '~/sql/sql.ts';
import { ValueRows } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Qualifier, Table, TableColumns } from '~/table.ts';
import { upgradeIfNeeded } from '~/up-migrations/mssql.ts';
import {
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	memoizeEscape,
	type RowsMapperGenerator,
	type UpdateSet,
} from '~/utils.ts';
import { View } from '~/view.ts';
import { DrizzleError, type Name, ViewBaseConfig } from '../index.ts';
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
import type { MsSqlViewBase } from './view-base.ts';

export interface MsSqlDialectConfig {
	useJitMappers?: boolean;
	codecs?: MsSqlCodecs;
}

const escapeMsSqlName = memoizeEscape((name) => `[${name.replace(/\]/g, ']]')}]`);
// Stored separately - differ per dialect
const rqbChunks = {
	select: new StringChunk('select'),
	top: new StringChunk(' top('),
	offset: new StringChunk(' offset '),
	rows: new StringChunk(' rows'),
	fetchNext: new StringChunk(' fetch next '),
	rowsOnly: new StringChunk(' rows only'),
	jsonQueryOpen: new StringChunk('json_query('),
	jsonQueryCoalesceOpen: new StringChunk('json_query(coalesce('),
	coalesceOpen: new StringChunk('coalesce('),
	jsonOneClose: new StringChunk('.[j] as '),
	jsonOneNestedClose: new StringChunk('.[j]) as '),
	jsonManyClose: new StringChunk(`.[j], '[]') as `),
	jsonManyNestedClose: new StringChunk(`.[j], '[]')) as `),
	applyOpen: new StringChunk(' outer apply ('),
	forJsonOne: new StringChunk(' for json path, include_null_values, without_array_wrapper) '),
	forJsonMany: new StringChunk(' for json path, include_null_values) '),
	applyColumn: new StringChunk('([j])'),
} as const;

export class MsSqlDialect {
	static readonly [entityKind]: string = 'MsSqlDialect';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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

	async rollback(
		migrations: MigrationMeta[],
		session: MsSqlSession,
		config: string | MigrationConfig,
		options?: RollbackOptions,
	): Promise<RollbackStep[]> {
		const migrationsTable = typeof config === 'string'
			? '__drizzle_migrations'
			: config.migrationsTable ?? '__drizzle_migrations';
		const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
		const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

		const dbMigrations = await session.execute<{ recordset: JournalRow[] }>(
			sql`select id, hash, created_at, name from ${table}`,
		)
			.then((result) => result.recordset)
			.catch((e) => {
				throw journalReadError(`${migrationsSchema}.${migrationsTable}`, e);
			});

		const plan = planRollback({ localMigrations: migrations, dbMigrations, options });
		if (options?.dryRun || plan.length === 0) return plan;

		await session.transaction(async (tx) => {
			for (const step of plan) {
				for (const stmt of step.downSql) {
					await tx.execute(sql.raw(stmt));
				}
				await tx.execute(sql`delete from ${table} where id = ${step.id}`);
			}
		});
		return plan;
	}

	escapeName(name: string): string {
		return escapeMsSqlName(name);
	}

	escapeParam(_num: number): string {
		return `@par${_num}`;
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

	buildDeleteQuery({ table, where, output, useSelectionCastCodecs }: MsSqlDeleteConfig): SQL {
		const outputSql = output
			? sql` output ${
				this.buildSelectionOutput(output, { type: 'DELETED', ignoreCastCodecs: !useSelectionCastCodecs })
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

	buildUpdateQuery({ table, set, where, output, useSelectionCastCodecs }: MsSqlUpdateConfig): SQL {
		const setSql = this.buildUpdateSet(table, set);

		const outputSql = sql``;

		if (output) {
			outputSql.append(sql` output `);

			if (output.inserted) {
				outputSql.append(
					this.buildSelectionOutput(output.inserted, {
						type: 'INSERTED',
						ignoreCastCodecs: !useSelectionCastCodecs,
					}),
				);
			}

			if (output.deleted) {
				if (output.inserted) outputSql.append(sql`, `); // add space if both are present
				outputSql.append(
					this.buildSelectionOutput(output.deleted, {
						type: 'DELETED',
						ignoreCastCodecs: !useSelectionCastCodecs,
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
				chunks.push(commonStringChunks[', ']);
			}
		}

		return new SQL(chunks);
	}

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
				chunks.push(commonStringChunks[', ']);
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
		useSelectionCastCodecs,
	}: MsSqlSelectConfig): SQL {
		if (!fieldsFlat) {
			throw new Error('Select query builder must be provided with `fieldsFlat` on `buildSelectQuery` invocation');
		}
		const fieldsList = fieldsFlat;

		const tableKind = chunkKindOf(table);
		const ownTableName = isChunk(table, tableKind, chunkKinds.subquery)
			? table._.alias
			: isChunk(table, tableKind, chunkKinds.view)
			? table[ViewBaseConfig].name
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

		const topSql = top ? sql` top(${top})` : undefined;

		const selection = this.buildSelection(fieldsList, {
			isSingleTable,
			table,
			ignoreCastCodecs: !useSelectionCastCodecs || setOperators.length > 0,
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
					joinsArray.push(commonStringChunks[' ']);
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
					joinsArray.push(commonStringChunks[' ']);
				}
			}
		}

		const joinsSql = new SQL(joinsArray);

		const whereSql = where ? sql` where ${where}` : undefined;

		const havingSql = having ? sql` having ${having}` : undefined;

		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			orderBySql = sql` order by ${sql.join(orderBy, commonStringChunks[', '])}`;
		}

		let groupBySql;
		if (groupBy && groupBy.length > 0) {
			groupBySql = sql` group by ${sql.join(groupBy, commonStringChunks[', '])}`;
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
			return this.buildSetOperations(finalQuery, fieldsList, useSelectionCastCodecs, setOperators);
		}

		return finalQuery;
	}

	buildSetOperations(
		leftSelect: SQL,
		outputSelection: SelectedFieldsOrdered,
		useSelectionCastCodecs: boolean | undefined,
		setOperators: MsSqlSelectConfig['setOperators'],
	): SQL {
		const lastIdx = setOperators.length - 1;
		let tailSql: SQL | undefined;

		for (let i = 0; i <= lastIdx; ++i) {
			const setOperator = setOperators[i]!;

			const hoistTail = useSelectionCastCodecs && i === lastIdx;
			leftSelect = this.buildSetOperationQuery({ leftSelect, setOperator, omitTail: hoistTail });
			if (hoistTail) tailSql = this.buildSetOperationTail(setOperator);
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
					orderByValues.push(sql`${unqualifyColumns(orderByUnit)}`);
				} else {
					orderByValues.push(sql`${orderByUnit}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, commonStringChunks[', '])}`;
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
		const rightChunk = sql`(${rightSelect.getSQL()})`;

		const operatorChunk = new StringChunk(`${type} ${isAll ? 'all ' : ''}`);
		const tailSql = omitTail ? undefined : this.buildSetOperationTail(setOperator);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${tailSql}`;
	}

	buildInsertQuery(
		{ table, values: valuesOrSelect, output, columnList, select, useSelectionCastCodecs }: MsSqlInsertConfig,
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
		insertOrderArr[orderWriteIdx++] = commonStringChunks['('];
		for (let i = 0; i < colEntries.length; ++i) {
			const [, { name }] = colEntries[i]!;
			insertOrderArr[orderWriteIdx++] = sql.identifier(name);

			if (i < colEntries.length - 1) insertOrderArr[orderWriteIdx++] = commonStringChunks[', '];
		}
		insertOrderArr[orderWriteIdx++] = commonStringChunks[')'];
		const insertOrder = new SQL(insertOrderArr);

		let valuesSqlList: SQLChunk[];

		if (select) {
			valuesSqlList = [(valuesOrSelect as AnyMsSqlSelectQueryBuilder | SQL).getSQL()];
		} else {
			const values = valuesOrSelect as Record<string, unknown>[];

			const cells: unknown[] = new Array(values.length * colEntries.length);
			let writeIdx = 0;

			for (let valueIndex = 0; valueIndex < values.length; ++valueIndex) {
				const value = values[valueIndex]!;

				for (let i = 0; i < colEntries.length; ++i) {
					const [fieldName, col] = colEntries[i]!;
					const colValue = value[fieldName];
					if (colValue === undefined) {
						if (col.defaultFn !== undefined) {
							cells[writeIdx++] = col.defaultFn();
						} else if (!col.default && col.onUpdateFn !== undefined) {
							cells[writeIdx++] = col.onUpdateFn();
						} else {
							cells[writeIdx++] = commonStringChunks['default'];
						}
					} else {
						cells[writeIdx++] = colValue;
					}
				}
			}

			valuesSqlList = [new ValueRows(cells, colEntries.map(([, col]) => col))];
		}

		const outputSql = output
			? sql` output ${
				this.buildSelectionOutput(output, { type: 'INSERTED', ignoreCastCodecs: !useSelectionCastCodecs })
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

	buildRelationalQuery(
		config: Omit<BuildRelationalQueryConfig, 'through'>,
	): BuildRelationalQueryResult {
		const chunks: SQLChunk[] = [];
		const selection = this.collectRelationalQuery(config, chunks);

		return {
			sql: new SQL(chunks),
			selection,
		};
	}

	private collectRelationalQuery({
		schema,
		table,
		tableConfig,
		queryConfig: config,
		relationWhere,
		mode,
		errorPath,
		depth,
		through,
		nested,
		withSubqueries,
		strategy,
	}: BuildRelationalQueryConfig, collectTo: SQLChunk[]): BuildRelationalQueryResult['selection'] {
		const selection: BuildRelationalQueryResult['selection'] = [];
		const isSingle = mode === 'first';
		const params = config === true ? undefined : config;
		const currentPath = errorPath ?? '';
		const currentDepth = depth ?? 0;
		const isOptimized = (currentDepth ? strategy : params?.strategy) !== 'basic';
		const collector: RelationalWithSubqueries = withSubqueries ?? { subqueries: new Map() };
		if (!currentDepth) {
			collectSubqueryAndUsedTables(collector, table);
			table = aliasedTable(table, `d${currentDepth}`);
		}
		const tableRef = table[Qualifier];

		const limit = isSingle ? 1 : params?.limit;
		const offset = params?.offset;

		const { sql: where } = relationalQueryWhereToSQL(
			table,
			params,
			tableConfig.relations,
			schema,
			collector,
			relationWhere,
		);
		const order = params?.orderBy
			? relationsOrderToSQL(table, params.orderBy, tableConfig.relations, schema, collector, 'top')
			: undefined;

		if (offset !== undefined && !order) {
			throw new DrizzleError({
				message: `Table "${tableConfig.name}"${
					currentPath ? ` ("${currentPath}")` : ''
				} uses "offset" without "orderBy". SQL Server only accepts "offset" as part of an "order by" clause.`,
			});
		}

		const withParam = params ? (params as WithContainer).with : undefined;
		const withKeys: string[] = [];
		if (withParam) {
			for (const key of Object.keys(withParam)) {
				if (withParam[key]) withKeys.push(key);
			}
		}

		const useOffset = offset !== undefined;

		// Reserved for `with` clause, filled once all subqueries are collected
		const withIdx = currentDepth ? -1 : collectTo.length;
		if (!currentDepth) collectTo.push(undefined);

		collectTo.push(rqbChunks.select);
		if (!useOffset && limit !== undefined) {
			collectTo.push(rqbChunks.top, limit as SQLChunk, commonStringChunks[')']);
		}
		collectTo.push(commonStringChunks[' ']);
		const hasColumns = buildRqbColumns(
			tableRef,
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
		const applyAliases: Name[] = new Array(withKeys.length);
		for (let i = 0; i < withKeys.length; ++i) {
			const k = withKeys[i]!;
			const relation = tableConfig.relations[k];
			if (!relation) throw new DrizzleError({ message: `Unknown relation "${tableConfig.name}" -> "${k}"` });

			const applyAlias = applyAliases[i] = sql.identifier(`r${currentDepth}_${i}`);
			if (selected++) collectTo.push(commonStringChunks[', ']);
			collectTo.push(
				relation.relationType === 'one'
					? nested ? rqbChunks.jsonQueryOpen : undefined
					: nested
					? rqbChunks.jsonQueryCoalesceOpen
					: rqbChunks.coalesceOpen,
				applyAlias,
				relation.relationType === 'one'
					? nested ? rqbChunks.jsonOneNestedClose : rqbChunks.jsonOneClose
					: nested
					? rqbChunks.jsonManyNestedClose
					: rqbChunks.jsonManyClose,
				sql.identifier(k),
			);
		}

		if (!selected) {
			throw new DrizzleError({
				message: `No fields selected for table "${tableConfig.name}"${currentPath ? ` ("${currentPath}")` : ''}`,
			});
		}

		// Optimize slow queries caused by planner applying pagination or filters after building relations
		// `offset` isn't pushed below `outer apply`: relations would get built for skipped rows as well.
		// Paginating the table in a derived table first restricts applies to the rows that are actually returned
		const isWrapped = withKeys.length > 0 && isOptimized && useOffset;

		collectTo.push(commonStringChunks[' from ']);
		if (isWrapped) collectTo.push(commonStringChunks['(select '], tableRef, commonStringChunks['.* from ']);
		getTableAsAliasSQL(table, collectTo);
		if (through) {
			collectTo.push(commonStringChunks[' inner join ']);
			getTableAsAliasSQL(through.table, collectTo);
			collectTo.push(commonStringChunks[' on '], ...through.condition);
		}
		if (isWrapped) {
			if (where) collectTo.push(commonStringChunks[' where '], ...where);
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
			// Wrapped only when paginated with `offset`
			collectTo.push(rqbChunks.offset, offset as SQLChunk, rqbChunks.rows);
			if (limit !== undefined) collectTo.push(rqbChunks.fetchNext, limit as SQLChunk, rqbChunks.rowsOnly);
			collectTo.push(commonStringChunks[') as '], tableRef);
		}

		for (let i = 0; i < withKeys.length; ++i) {
			const k = withKeys[i]!;
			const join = withParam![k]!;
			const relation = tableConfig.relations[k]!;
			const isSingle = relation.relationType === 'one';
			collectSubqueryAndUsedTables(collector, relation.targetTable);
			collectSubqueryAndUsedTables(collector, relation.throughTable);

			const targetTable = aliasedTable(relation.targetTable, `d${currentDepth + 1}`);
			const throughTable = relation.throughTable
				? (aliasedTable(relation.throughTable, `tr${currentDepth}`))
				: undefined;

			const { filter, joinCondition } = relationToSQL(relation, table, targetTable, throughTable);

			collectTo.push(rqbChunks.applyOpen);
			const innerSelection = this.collectRelationalQuery({
				table: targetTable,
				mode: isSingle ? 'first' : 'many',
				schema,
				queryConfig: join as DBQueryConfigRoot,
				tableConfig: schema[relation.targetTableName]!,
				relationWhere: filter,
				errorPath: `${currentPath.length ? `${currentPath}.` : ''}${k}`,
				depth: currentDepth + 1,
				withSubqueries: collector,
				strategy: currentDepth ? strategy : params?.strategy,
				through: throughTable ? { table: throughTable, condition: joinCondition! } : undefined,
				nested: true,
			}, collectTo);
			collectTo.push(
				isSingle ? rqbChunks.forJsonOne : rqbChunks.forJsonMany,
				applyAliases[i],
				rqbChunks.applyColumn,
			);

			selection.push({
				field: targetTable,
				fieldType: 'Nested',
				key: k,
				selection: innerSelection,
				isArray: !isSingle,
				isOptional: ((relation as AnyOne).optional ?? false)
					|| (join !== true && !!(join as Exclude<typeof join, boolean | undefined>).where),
			});
		}

		if (isWrapped) {
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
		} else {
			if (where) collectTo.push(commonStringChunks[' where '], ...where);
			if (order) collectTo.push(commonStringChunks[' order by '], ...order);
			if (useOffset) {
				collectTo.push(rqbChunks.offset, offset as SQLChunk, rqbChunks.rows);
				if (limit !== undefined) collectTo.push(rqbChunks.fetchNext, limit as SQLChunk, rqbChunks.rowsOnly);
			}
		}

		if (withIdx !== -1) collectTo[withIdx] = this.buildWithCTE([...collector.subqueries.values()]);

		return selection;
	}
}
