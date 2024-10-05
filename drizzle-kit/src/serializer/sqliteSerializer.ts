import chalk from 'chalk';
import { getTableName, is, SQL } from 'drizzle-orm';
import {
	// AnySQLiteColumnBuilder,
	AnySQLiteTable,
	getTableConfig,
	SQLiteBaseInteger,
	SQLiteSyncDialect,
	uniqueKeyName,
} from 'drizzle-orm/sqlite-core';
import { withStyle } from '../cli/validations/outputs';
import type { IntrospectStage, IntrospectStatus } from '../cli/views';
import type {
	Column,
	ForeignKey,
	Index,
	PrimaryKey,
	SQLiteKitInternals,
	SQLiteSchemaInternal,
	Table,
	UniqueConstraint,
} from '../serializer/sqliteSchema';
import type { SQLiteDB } from '../utils';
import { sqlToStr } from '.';

const dialect = new SQLiteSyncDialect();

export const generateSqliteSnapshot = (
	tables: AnySQLiteTable[],
): SQLiteSchemaInternal => {
	const result: Record<string, Table> = {};
	const internal: SQLiteKitInternals = { indexes: {} };
	for (const table of tables) {
		// const tableName = getTableName(table);
		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const foreignKeysObject: Record<string, ForeignKey> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};

		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys: tableForeignKeys,
			primaryKeys,
			uniqueConstraints,
		} = getTableConfig(table);

		columns.forEach((column) => {
			const notNull: boolean = column.notNull;
			const primaryKey: boolean = column.primary;
			const generated = column.generated;

			const columnToSet: Column = {
				name: column.name,
				type: column.getSQLType(),
				primaryKey,
				notNull,
				autoincrement: is(column, SQLiteBaseInteger)
					? column.autoIncrement
					: false,
				generated: generated
					? {
						as: is(generated.as, SQL)
							? `(${dialect.sqlToQuery(generated.as as SQL, 'indexes').sql})`
							: typeof generated.as === 'function'
							? `(${dialect.sqlToQuery(generated.as() as SQL, 'indexes').sql})`
							: `(${generated.as as any})`,
						type: generated.mode ?? 'virtual',
					}
					: undefined,
			};

			if (column.default !== undefined) {
				if (is(column.default, SQL)) {
					columnToSet.default = sqlToStr(column.default);
				} else {
					columnToSet.default = typeof column.default === 'string'
						? `'${column.default}'`
						: typeof column.default === 'object'
								|| Array.isArray(column.default)
						? `'${JSON.stringify(column.default)}'`
						: column.default;
				}
			}
			columnsObject[column.name] = columnToSet;

			if (column.isUnique) {
				const existingUnique = indexesObject[column.uniqueName!];
				if (typeof existingUnique !== 'undefined') {
					console.log(
						`\n${
							withStyle.errorWarning(`We\'ve found duplicated unique constraint names in ${
								chalk.underline.blue(
									tableName,
								)
							} table. 
          The unique constraint ${
								chalk.underline.blue(
									column.uniqueName,
								)
							} on the ${
								chalk.underline.blue(
									column.name,
								)
							} column is confilcting with a unique constraint name already defined for ${
								chalk.underline.blue(
									existingUnique.columns.join(','),
								)
							} columns\n`)
						}`,
					);
					process.exit(1);
				}
				indexesObject[column.uniqueName!] = {
					name: column.uniqueName!,
					columns: [columnToSet.name],
					isUnique: true,
				};
			}
		});

		const foreignKeys: ForeignKey[] = tableForeignKeys.map((fk) => {
			const name = fk.getName();
			const tableFrom = tableName;
			const onDelete = fk.onDelete ?? 'no action';
			const onUpdate = fk.onUpdate ?? 'no action';
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT);
			const columnsFrom = reference.columns.map((it) => it.name);
			const columnsTo = reference.foreignColumns.map((it) => it.name);
			return {
				name,
				tableFrom,
				tableTo,
				columnsFrom,
				columnsTo,
				onDelete,
				onUpdate,
			} as ForeignKey;
		});

		foreignKeys.forEach((it) => {
			foreignKeysObject[it.name] = it;
		});

		indexes.forEach((value) => {
			const columns = value.config.columns;
			const name = value.config.name;

			let indexColumns = columns.map((it) => {
				if (is(it, SQL)) {
					const sql = dialect.sqlToQuery(it, 'indexes').sql;
					if (typeof internal!.indexes![name] === 'undefined') {
						internal!.indexes![name] = {
							columns: {
								[sql]: {
									isExpression: true,
								},
							},
						};
					} else {
						if (typeof internal!.indexes![name]?.columns[sql] === 'undefined') {
							internal!.indexes![name]!.columns[sql] = {
								isExpression: true,
							};
						} else {
							internal!.indexes![name]!.columns[sql]!.isExpression = true;
						}
					}
					return sql;
				} else {
					return it.name;
				}
			});

			let where: string | undefined = undefined;
			if (value.config.where !== undefined) {
				if (is(value.config.where, SQL)) {
					where = dialect.sqlToQuery(value.config.where).sql;
				}
			}

			indexesObject[name] = {
				name,
				columns: indexColumns,
				isUnique: value.config.unique ?? false,
				where,
			};
		});

		uniqueConstraints?.map((unq) => {
			const columnNames = unq.columns.map((c) => c.name);

			const name = unq.name ?? uniqueKeyName(table, columnNames);

			const existingUnique = indexesObject[name];
			if (typeof existingUnique !== 'undefined') {
				console.log(
					`\n${
						withStyle.errorWarning(
							`We\'ve found duplicated unique constraint names in ${
								chalk.underline.blue(
									tableName,
								)
							} table. \nThe unique constraint ${
								chalk.underline.blue(
									name,
								)
							} on the ${
								chalk.underline.blue(
									columnNames.join(','),
								)
							} columns is confilcting with a unique constraint name already defined for ${
								chalk.underline.blue(
									existingUnique.columns.join(','),
								)
							} columns\n`,
						)
					}`,
				);
				process.exit(1);
			}

			indexesObject[name] = {
				name: unq.name!,
				columns: columnNames,
				isUnique: true,
			};
		});

		primaryKeys.forEach((it) => {
			if (it.columns.length > 1) {
				primaryKeysObject[it.getName()] = {
					columns: it.columns.map((it) => it.name),
					name: it.getName(),
				};
			} else {
				columnsObject[it.columns[0].name].primaryKey = true;
			}
		});

		result[tableName] = {
			name: tableName,
			columns: columnsObject,
			indexes: indexesObject,
			foreignKeys: foreignKeysObject,
			compositePrimaryKeys: primaryKeysObject,
			uniqueConstraints: uniqueConstraintObject,
		};
	}

	return {
		version: '6',
		dialect: 'sqlite',
		tables: result,
		enums: {},
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};

function mapSqlToSqliteType(sqlType: string): string {
	const lowered = sqlType.toLowerCase();
	if (
		[
			'int',
			'integer',
			'integer auto_increment',
			'tinyint',
			'smallint',
			'mediumint',
			'bigint',
			'unsigned big int',
			'int2',
			'int8',
		].some((it) => lowered.startsWith(it))
	) {
		return 'integer';
	} else if (
		[
			'character',
			'varchar',
			'varying character',
			'national varying character',
			'nchar',
			'native character',
			'nvarchar',
			'text',
			'clob',
		].some((it) => lowered.startsWith(it))
	) {
		const match = lowered.match(/\d+/);

		if (match) {
			return `text(${match[0]})`;
		}

		return 'text';
	} else if (lowered.startsWith('blob')) {
		return 'blob';
	} else if (
		['real', 'double', 'double precision', 'float'].some((it) => lowered.startsWith(it))
	) {
		return 'real';
	} else {
		return 'numeric';
	}
}

interface ColumnInfo {
	columnName: string;
	expression: string;
	type: 'stored' | 'virtual';
}

function extractGeneratedColumns(input: string): Record<string, ColumnInfo> {
	const columns: Record<string, ColumnInfo> = {};
	const lines = input.split(/,\s*(?![^()]*\))/); // Split by commas outside parentheses

	for (const line of lines) {
		if (line.includes('GENERATED ALWAYS AS')) {
			const parts = line.trim().split(/\s+/);
			const columnName = parts[0].replace(/[`'"]/g, ''); // Remove quotes around the column name
			const expression = line
				.substring(line.indexOf('('), line.indexOf(')') + 1)
				.trim();

			// Extract type ensuring to remove any trailing characters like ')'
			const typeIndex = parts.findIndex((part) => part.match(/(stored|virtual)/i));
			let type: ColumnInfo['type'] = 'virtual';
			if (typeIndex !== -1) {
				type = parts[typeIndex]
					.replace(/[^a-z]/gi, '')
					.toLowerCase() as ColumnInfo['type'];
			}

			columns[columnName] = {
				columnName: columnName,
				expression: expression,
				type,
			};
		}
	}
	return columns;
}

export const fromDatabase = async (
	db: SQLiteDB,
	tablesFilter: (table: string) => boolean = (table) => true,
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void,
): Promise<SQLiteSchemaInternal> => {
	const result: Record<string, Table> = {};

	const columns = await db.query<{
		tableName: string;
		columnName: string;
		columnType: string;
		notNull: number;
		defaultValue: string;
		pk: number;
		seq: number;
		hidden: number;
		sql: string;
	}>(
		`SELECT 
    m.name as "tableName", p.name as "columnName", p.type as "columnType", p."notnull" as "notNull", p.dflt_value as "defaultValue", p.pk as pk, p.hidden as hidden, m.sql
    FROM sqlite_master AS m JOIN pragma_table_xinfo(m.name) AS p
    WHERE m.type = 'table' 
    and m.tbl_name != 'sqlite_sequence' 
    and m.tbl_name != 'sqlite_stat1' 
    and m.tbl_name != '_litestream_seq' 
    and m.tbl_name != '_litestream_lock' 
    and m.tbl_name != 'libsql_wasm_func_table' 
    and m.tbl_name != '__drizzle_migrations' 
    and m.tbl_name != '_cf_KV';
    `,
	);

	const tablesWithSeq: string[] = [];

	const seq = await db.query<{
		name: string;
	}>(
		`SELECT * FROM sqlite_master WHERE name != 'sqlite_sequence' 
    and name != 'sqlite_stat1' 
    and name != '_litestream_seq' 
    and name != '_litestream_lock' 
    and tbl_name != '_cf_KV' 
    and sql GLOB '*[ *' || CHAR(9) || CHAR(10) || CHAR(13) || ']AUTOINCREMENT[^'']*';`,
	);

	for (const s of seq) {
		tablesWithSeq.push(s.name);
	}

	let columnsCount = 0;
	let tablesCount = new Set();
	let indexesCount = 0;
	let foreignKeysCount = 0;

	// append primaryKeys by table
	const tableToPk: { [tname: string]: string[] } = {};

	let tableToGeneratedColumnsInfo: Record<
		string,
		Record<string, ColumnInfo>
	> = {};

	for (const column of columns) {
		if (!tablesFilter(column.tableName)) continue;

		columnsCount += 1;
		if (progressCallback) {
			progressCallback('columns', columnsCount, 'fetching');
		}
		const tableName = column.tableName;

		tablesCount.add(tableName);
		if (progressCallback) {
			progressCallback('tables', tablesCount.size, 'fetching');
		}
		const columnName = column.columnName;
		const isNotNull = column.notNull === 1; // 'YES', 'NO'
		const columnType = column.columnType; // varchar(256)
		const isPrimary = column.pk !== 0; // 'PRI', ''
		const columnDefault: string = column.defaultValue;

		const isAutoincrement = isPrimary && tablesWithSeq.includes(tableName);

		if (isPrimary) {
			if (typeof tableToPk[tableName] === 'undefined') {
				tableToPk[tableName] = [columnName];
			} else {
				tableToPk[tableName].push(columnName);
			}
		}

		const table = result[tableName];

		if (column.hidden === 2 || column.hidden === 3) {
			if (
				typeof tableToGeneratedColumnsInfo[column.tableName] === 'undefined'
			) {
				tableToGeneratedColumnsInfo[column.tableName] = extractGeneratedColumns(
					column.sql,
				);
			}
		}

		const newColumn: Column = {
			default: columnDefault === null
				? undefined
				: /^-?[\d.]+(?:e-?\d+)?$/.test(columnDefault)
				? Number(columnDefault)
				: ['CURRENT_TIME', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(
						columnDefault,
					)
				? `(${columnDefault})`
				: columnDefault === 'false'
				? false
				: columnDefault === 'true'
				? true
				: columnDefault.startsWith("'") && columnDefault.endsWith("'")
				? columnDefault
				// ? columnDefault.substring(1, columnDefault.length - 1)
				: `(${columnDefault})`,
			autoincrement: isAutoincrement,
			name: columnName,
			type: mapSqlToSqliteType(columnType),
			primaryKey: false,
			notNull: isNotNull,
			generated: tableToGeneratedColumnsInfo[tableName]
					&& tableToGeneratedColumnsInfo[tableName][columnName]
				? {
					type: tableToGeneratedColumnsInfo[tableName][columnName].type,
					as: tableToGeneratedColumnsInfo[tableName][columnName].expression,
				}
				: undefined,
		};

		if (!table) {
			result[tableName] = {
				name: tableName,
				columns: {
					[columnName]: newColumn,
				},
				compositePrimaryKeys: {},
				indexes: {},
				foreignKeys: {},
				uniqueConstraints: {},
			};
		} else {
			result[tableName]!.columns[columnName] = newColumn;
		}
	}

	for (const [key, value] of Object.entries(tableToPk)) {
		if (value.length > 1) {
			result[key].compositePrimaryKeys = {
				[`${key}_${value.join('_')}_pk`]: {
					columns: value,
					name: `${key}_${value.join('_')}_pk`,
				},
			};
		} else if (value.length === 1) {
			result[key].columns[value[0]].primaryKey = true;
		} else {
		}
	}

	if (progressCallback) {
		progressCallback('columns', columnsCount, 'done');
		progressCallback('tables', tablesCount.size, 'done');
	}
	try {
		const fks = await db.query<{
			tableFrom: string;
			tableTo: string;
			from: string;
			to: string;
			onUpdate: string;
			onDelete: string;
			seq: number;
			id: number;
		}>(
			`SELECT m.name as "tableFrom", f.id as "id", f."table" as "tableTo", f."from", f."to", f."on_update" as "onUpdate", f."on_delete" as "onDelete", f.seq as "seq"
      FROM sqlite_master m, pragma_foreign_key_list(m.name) as f 
      where m.tbl_name != '_cf_KV';`,
		);

		const fkByTableName: Record<string, ForeignKey> = {};

		for (const fkRow of fks) {
			foreignKeysCount += 1;
			if (progressCallback) {
				progressCallback('fks', foreignKeysCount, 'fetching');
			}
			const tableName: string = fkRow.tableFrom;
			const columnName: string = fkRow.from;
			const refTableName = fkRow.tableTo;
			const refColumnName: string = fkRow.to;
			const updateRule: string = fkRow.onUpdate;
			const deleteRule = fkRow.onDelete;
			const sequence = fkRow.seq;
			const id = fkRow.id;

			const tableInResult = result[tableName];
			if (typeof tableInResult === 'undefined') continue;

			if (typeof fkByTableName[`${tableName}_${id}`] !== 'undefined') {
				fkByTableName[`${tableName}_${id}`]!.columnsFrom.push(columnName);
				fkByTableName[`${tableName}_${id}`]!.columnsTo.push(refColumnName);
			} else {
				fkByTableName[`${tableName}_${id}`] = {
					name: '',
					tableFrom: tableName,
					tableTo: refTableName,
					columnsFrom: [columnName],
					columnsTo: [refColumnName],
					onDelete: deleteRule?.toLowerCase(),
					onUpdate: updateRule?.toLowerCase(),
				};
			}

			const columnsFrom = fkByTableName[`${tableName}_${id}`].columnsFrom;
			const columnsTo = fkByTableName[`${tableName}_${id}`].columnsTo;
			fkByTableName[
				`${tableName}_${id}`
			].name = `${tableName}_${
				columnsFrom.join(
					'_',
				)
			}_${refTableName}_${columnsTo.join('_')}_fk`;
		}

		for (const idx of Object.keys(fkByTableName)) {
			const value = fkByTableName[idx];
			result[value.tableFrom].foreignKeys[value.name] = value;
		}
	} catch (e) {
		// console.log(`Can't proccess foreign keys`);
	}
	if (progressCallback) {
		progressCallback('fks', foreignKeysCount, 'done');
	}
	const idxs = await db.query<{
		tableName: string;
		indexName: string;
		columnName: string;
		isUnique: number;
		seq: string;
	}>(
		`SELECT 
    m.tbl_name as tableName,
    il.name as indexName,
    ii.name as columnName,
    il.[unique] as isUnique,
    il.seq as seq
FROM sqlite_master AS m,
    pragma_index_list(m.name) AS il,
    pragma_index_info(il.name) AS ii
WHERE 
    m.type = 'table' 
    and il.name NOT LIKE 'sqlite_autoindex_%'
    and m.tbl_name != '_cf_KV';`,
	);

	for (const idxRow of idxs) {
		const tableName = idxRow.tableName;
		const constraintName = idxRow.indexName;
		const columnName: string = idxRow.columnName;
		const isUnique = idxRow.isUnique === 1;

		const tableInResult = result[tableName];
		if (typeof tableInResult === 'undefined') continue;

		indexesCount += 1;
		if (progressCallback) {
			progressCallback('indexes', indexesCount, 'fetching');
		}

		if (
			typeof tableInResult.indexes[constraintName] !== 'undefined'
			&& columnName
		) {
			tableInResult.indexes[constraintName]!.columns.push(columnName);
		} else {
			tableInResult.indexes[constraintName] = {
				name: constraintName,
				columns: columnName ? [columnName] : [],
				isUnique: isUnique,
			};
		}
		// if (isUnique) {
		//   if (typeof tableInResult.uniqueConstraints[constraintName] !== "undefined") {
		//     tableInResult.uniqueConstraints[constraintName]!.columns.push(columnName);
		//   } else {
		//     tableInResult.uniqueConstraints[constraintName] = {
		//       name: constraintName,
		//       columns: [columnName],
		//     };
		//   }
		// } else {
		//   if (typeof tableInResult.indexes[constraintName] !== "undefined") {
		//     tableInResult.indexes[constraintName]!.columns.push(columnName);
		//   } else {
		//     tableInResult.indexes[constraintName] = {
		//       name: constraintName,
		//       columns: [columnName],
		//       isUnique: isUnique,
		//     };
		//   }
		// }
	}
	if (progressCallback) {
		progressCallback('indexes', indexesCount, 'done');
		// progressCallback("enums", 0, "fetching");
		progressCallback('enums', 0, 'done');
	}

	return {
		version: '6',
		dialect: 'sqlite',
		tables: result,
		enums: {},
		_meta: {
			tables: {},
			columns: {},
		},
	};
};
