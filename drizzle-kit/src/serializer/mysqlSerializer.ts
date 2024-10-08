import chalk from 'chalk';
import { getTableName, is } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';
import { toCamelCase, toSnakeCase } from 'drizzle-orm/casing';
import { AnyMySqlTable, MySqlDialect, type PrimaryKey as PrimaryKeyORM, uniqueKeyName } from 'drizzle-orm/mysql-core';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { RowDataPacket } from 'mysql2/promise';
import { CasingType } from 'src/cli/validations/common';
import { withStyle } from '../cli/validations/outputs';
import { IntrospectStage, IntrospectStatus } from '../cli/views';
import {
	Column,
	ForeignKey,
	Index,
	MySqlKitInternals,
	MySqlSchemaInternal,
	PrimaryKey,
	Table,
	UniqueConstraint,
} from '../serializer/mysqlSchema';
import { type DB, getColumnCasing } from '../utils';
import { sqlToStr } from '.';
// import { MySqlColumnWithAutoIncrement } from "drizzle-orm/mysql-core";
// import { MySqlDateBaseColumn } from "drizzle-orm/mysql-core";

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export const generateMySqlSnapshot = (
	tables: AnyMySqlTable[],
	casing: CasingType | undefined,
): MySqlSchemaInternal => {
	const dialect = new MySqlDialect({ casing });
	const result: Record<string, Table> = {};
	const internal: MySqlKitInternals = { tables: {}, indexes: {} };
	for (const table of tables) {
		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys,
			schema,
			primaryKeys,
			uniqueConstraints,
		} = getTableConfig(table);
		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const foreignKeysObject: Record<string, ForeignKey> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};

		columns.forEach((column) => {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const sqlTypeLowered = column.getSQLType().toLowerCase();
			const autoIncrement = typeof (column as any).autoIncrement === 'undefined'
				? false
				: (column as any).autoIncrement;

			const generated = column.generated;

			const columnToSet: Column = {
				name,
				type: column.getSQLType(),
				primaryKey: false,
				// If field is autoincrement it's notNull by default
				// notNull: autoIncrement ? true : notNull,
				notNull,
				autoincrement: autoIncrement,
				onUpdate: (column as any).hasOnUpdateNow,
				generated: generated
					? {
						as: is(generated.as, SQL)
							? dialect.sqlToQuery(generated.as as SQL).sql
							: typeof generated.as === 'function'
							? dialect.sqlToQuery(generated.as() as SQL).sql
							: (generated.as as any),
						type: generated.mode ?? 'stored',
					}
					: undefined,
			};

			if (column.primary) {
				primaryKeysObject[`${tableName}_${name}`] = {
					name: `${tableName}_${name}`,
					columns: [name],
				};
			}

			if (column.isUnique) {
				const existingUnique = uniqueConstraintObject[column.uniqueName!];
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
									name,
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
				uniqueConstraintObject[column.uniqueName!] = {
					name: column.uniqueName!,
					columns: [columnToSet.name],
				};
			}

			if (column.default !== undefined) {
				if (is(column.default, SQL)) {
					columnToSet.default = sqlToStr(column.default, casing);
				} else {
					if (typeof column.default === 'string') {
						columnToSet.default = `'${column.default}'`;
					} else {
						if (sqlTypeLowered === 'json') {
							columnToSet.default = `'${JSON.stringify(column.default)}'`;
						} else if (column.default instanceof Date) {
							if (sqlTypeLowered === 'date') {
								columnToSet.default = `'${column.default.toISOString().split('T')[0]}'`;
							} else if (
								sqlTypeLowered.startsWith('datetime')
								|| sqlTypeLowered.startsWith('timestamp')
							) {
								columnToSet.default = `'${
									column.default
										.toISOString()
										.replace('T', ' ')
										.slice(0, 23)
								}'`;
							}
						} else {
							columnToSet.default = column.default;
						}
					}
					if (['blob', 'text', 'json'].includes(column.getSQLType())) {
						columnToSet.default = `(${columnToSet.default})`;
					}
				}
			}
			columnsObject[name] = columnToSet;
		});

		primaryKeys.map((pk: PrimaryKeyORM) => {
			const originalColumnNames = pk.columns.map((c) => c.name);
			const columnNames = pk.columns.map((c: any) => getColumnCasing(c, casing));

			let name = pk.getName();
			if (casing !== undefined) {
				for (let i = 0; i < originalColumnNames.length; i++) {
					name = name.replace(originalColumnNames[i], columnNames[i]);
				}
			}

			primaryKeysObject[name] = {
				name,
				columns: columnNames,
			};

			// all composite pk's should be treated as notNull
			for (const column of pk.columns) {
				columnsObject[getColumnCasing(column, casing)].notNull = true;
			}
		});

		uniqueConstraints?.map((unq) => {
			const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));

			const name = unq.name ?? uniqueKeyName(table, columnNames);

			const existingUnique = uniqueConstraintObject[name];
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

			uniqueConstraintObject[name] = {
				name: unq.name!,
				columns: columnNames,
			};
		});

		const fks: ForeignKey[] = foreignKeys.map((fk) => {
			const tableFrom = tableName;
			const onDelete = fk.onDelete ?? 'no action';
			const onUpdate = fk.onUpdate ?? 'no action';
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT);

			const originalColumnsFrom = reference.columns.map((it) => it.name);
			const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
			const originalColumnsTo = reference.foreignColumns.map((it) => it.name);
			const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

			let name = fk.getName();
			if (casing !== undefined) {
				for (let i = 0; i < originalColumnsFrom.length; i++) {
					name = name.replace(originalColumnsFrom[i], columnsFrom[i]);
				}
				for (let i = 0; i < originalColumnsTo.length; i++) {
					name = name.replace(originalColumnsTo[i], columnsTo[i]);
				}
			}

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

		fks.forEach((it) => {
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
					return `${getColumnCasing(it, casing)}`;
				}
			});

			if (value.config.unique) {
				if (typeof uniqueConstraintObject[name] !== 'undefined') {
					console.log(
						`\n${
							withStyle.errorWarning(
								`We\'ve found duplicated unique constraint names in ${
									chalk.underline.blue(
										tableName,
									)
								} table. \nThe unique index ${
									chalk.underline.blue(
										name,
									)
								} on the ${
									chalk.underline.blue(
										indexColumns.join(','),
									)
								} columns is confilcting with a unique constraint name already defined for ${
									chalk.underline.blue(
										uniqueConstraintObject[name].columns.join(','),
									)
								} columns\n`,
							)
						}`,
					);
					process.exit(1);
				}
			} else {
				if (typeof foreignKeysObject[name] !== 'undefined') {
					console.log(
						`\n${
							withStyle.errorWarning(
								`In MySQL, when creating a foreign key, an index is automatically generated with the same name as the foreign key constraint.\n\nWe have encountered a collision between the index name on columns ${
									chalk.underline.blue(
										indexColumns.join(','),
									)
								} and the foreign key on columns ${
									chalk.underline.blue(
										foreignKeysObject[name].columnsFrom.join(','),
									)
								}. Please change either the index name or the foreign key name. For more information, please refer to https://dev.mysql.com/doc/refman/8.0/en/constraint-foreign-key.html\n
            `,
							)
						}`,
					);
					process.exit(1);
				}
			}

			indexesObject[name] = {
				name,
				columns: indexColumns,
				isUnique: value.config.unique ?? false,
				using: value.config.using,
				algorithm: value.config.algorythm,
				lock: value.config.lock,
			};
		});

		// only handle tables without schemas
		if (!schema) {
			result[tableName] = {
				name: tableName,
				columns: columnsObject,
				indexes: indexesObject,
				foreignKeys: foreignKeysObject,
				compositePrimaryKeys: primaryKeysObject,
				uniqueConstraints: uniqueConstraintObject,
			};
		}
	}

	return {
		version: '5',
		dialect: 'mysql',
		tables: result,
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};

function clearDefaults(defaultValue: any, collate: string) {
	if (typeof collate === 'undefined' || collate === null) {
		collate = `utf8mb4`;
	}

	let resultDefault = defaultValue;
	collate = `_${collate}`;
	if (defaultValue.startsWith(collate)) {
		resultDefault = resultDefault
			.substring(collate.length, defaultValue.length)
			.replace(/\\/g, '');
		if (resultDefault.startsWith("'") && resultDefault.endsWith("'")) {
			return `('${resultDefault.substring(1, resultDefault.length - 1)}')`;
		} else {
			return `'${resultDefault}'`;
		}
	} else {
		return `(${resultDefault})`;
	}
}

export const fromDatabase = async (
	db: DB,
	inputSchema: string,
	tablesFilter: (table: string) => boolean = (table) => true,
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void,
): Promise<MySqlSchemaInternal> => {
	const result: Record<string, Table> = {};
	const internals: MySqlKitInternals = { tables: {}, indexes: {} };

	const columns = await db.query(`select * from information_schema.columns
	where table_schema = '${inputSchema}' and table_name != '__drizzle_migrations'
	order by table_name, ordinal_position;`);

	const response = columns as RowDataPacket[];

	const schemas: string[] = [];

	let columnsCount = 0;
	let tablesCount = new Set();
	let indexesCount = 0;
	let foreignKeysCount = 0;

	const idxs = await db.query(
		`select * from INFORMATION_SCHEMA.STATISTICS
	WHERE INFORMATION_SCHEMA.STATISTICS.TABLE_SCHEMA = '${inputSchema}' and INFORMATION_SCHEMA.STATISTICS.INDEX_NAME != 'PRIMARY';`,
	);

	const idxRows = idxs as RowDataPacket[];

	for (const column of response) {
		if (!tablesFilter(column['TABLE_NAME'] as string)) continue;

		columnsCount += 1;
		if (progressCallback) {
			progressCallback('columns', columnsCount, 'fetching');
		}
		const schema: string = column['TABLE_SCHEMA'];
		const tableName = column['TABLE_NAME'];

		tablesCount.add(`${schema}.${tableName}`);
		if (progressCallback) {
			progressCallback('columns', tablesCount.size, 'fetching');
		}
		const columnName: string = column['COLUMN_NAME'];
		const isNullable = column['IS_NULLABLE'] === 'YES'; // 'YES', 'NO'
		const dataType = column['DATA_TYPE']; // varchar
		const columnType = column['COLUMN_TYPE']; // varchar(256)
		const isPrimary = column['COLUMN_KEY'] === 'PRI'; // 'PRI', ''
		const columnDefault: string = column['COLUMN_DEFAULT'];
		const collation: string = column['CHARACTER_SET_NAME'];
		const geenratedExpression: string = column['GENERATION_EXPRESSION'];

		let columnExtra = column['EXTRA'];
		let isAutoincrement = false; // 'auto_increment', ''
		let isDefaultAnExpression = false; // 'auto_increment', ''

		if (typeof column['EXTRA'] !== 'undefined') {
			columnExtra = column['EXTRA'];
			isAutoincrement = column['EXTRA'] === 'auto_increment'; // 'auto_increment', ''
			isDefaultAnExpression = column['EXTRA'].includes('DEFAULT_GENERATED'); // 'auto_increment', ''
		}

		// if (isPrimary) {
		//   if (typeof tableToPk[tableName] === "undefined") {
		//     tableToPk[tableName] = [columnName];
		//   } else {
		//     tableToPk[tableName].push(columnName);
		//   }
		// }

		if (schema !== inputSchema) {
			schemas.push(schema);
		}

		const table = result[tableName];

		// let changedType = columnType.replace("bigint unsigned", "serial")
		let changedType = columnType;

		if (columnType === 'bigint unsigned' && !isNullable && isAutoincrement) {
			// check unique here
			const uniqueIdx = idxRows.filter(
				(it) =>
					it['COLUMN_NAME'] === columnName
					&& it['TABLE_NAME'] === tableName
					&& it['NON_UNIQUE'] === 0,
			);
			if (uniqueIdx && uniqueIdx.length === 1) {
				changedType = columnType.replace('bigint unsigned', 'serial');
			}
		}

		if (columnType.startsWith('tinyint')) {
			changedType = 'tinyint';
		}

		let onUpdate: boolean | undefined = undefined;
		if (
			columnType.startsWith('timestamp')
			&& typeof columnExtra !== 'undefined'
			&& columnExtra.includes('on update CURRENT_TIMESTAMP')
		) {
			onUpdate = true;
		}

		const newColumn: Column = {
			default: columnDefault === null
				? undefined
				: /^-?[\d.]+(?:e-?\d+)?$/.test(columnDefault)
						&& !['decimal', 'char', 'varchar'].some((type) => columnType.startsWith(type))
				? Number(columnDefault)
				: isDefaultAnExpression
				? clearDefaults(columnDefault, collation)
				: `'${columnDefault}'`,
			autoincrement: isAutoincrement,
			name: columnName,
			type: changedType,
			primaryKey: false,
			notNull: !isNullable,
			onUpdate,
			generated: geenratedExpression
				? {
					as: geenratedExpression,
					type: columnExtra === 'VIRTUAL GENERATED' ? 'virtual' : 'stored',
				}
				: undefined,
		};

		// Set default to internal object
		if (isDefaultAnExpression) {
			if (typeof internals!.tables![tableName] === 'undefined') {
				internals!.tables![tableName] = {
					columns: {
						[columnName]: {
							isDefaultAnExpression: true,
						},
					},
				};
			} else {
				if (
					typeof internals!.tables![tableName]!.columns[columnName]
						=== 'undefined'
				) {
					internals!.tables![tableName]!.columns[columnName] = {
						isDefaultAnExpression: true,
					};
				} else {
					internals!.tables![tableName]!.columns[
						columnName
					]!.isDefaultAnExpression = true;
				}
			}
		}

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

	const tablePks = await db.query(
		`SELECT table_name, column_name, ordinal_position
  FROM information_schema.table_constraints t
  LEFT JOIN information_schema.key_column_usage k
  USING(constraint_name,table_schema,table_name)
  WHERE t.constraint_type='PRIMARY KEY'
      and table_name != '__drizzle_migrations'
      AND t.table_schema = '${inputSchema}'
      ORDER BY ordinal_position`,
	);

	const tableToPk: { [tname: string]: string[] } = {};

	const tableToPkRows = tablePks as RowDataPacket[];
	for (const tableToPkRow of tableToPkRows) {
		const tableName: string = tableToPkRow['TABLE_NAME'];
		const columnName: string = tableToPkRow['COLUMN_NAME'];
		const position: string = tableToPkRow['ordinal_position'];

		if (typeof result[tableName] === 'undefined') {
			continue;
		}

		if (typeof tableToPk[tableName] === 'undefined') {
			tableToPk[tableName] = [columnName];
		} else {
			tableToPk[tableName].push(columnName);
		}
	}

	for (const [key, value] of Object.entries(tableToPk)) {
		// if (value.length > 1) {
		result[key].compositePrimaryKeys = {
			[`${key}_${value.join('_')}`]: {
				name: `${key}_${value.join('_')}`,
				columns: value,
			},
		};
		// } else if (value.length === 1) {
		// result[key].columns[value[0]].primaryKey = true;
		// } else {
		// }
	}
	if (progressCallback) {
		progressCallback('columns', columnsCount, 'done');
		progressCallback('tables', tablesCount.size, 'done');
	}
	try {
		const fks = await db.query(
			`SELECT 
      kcu.TABLE_SCHEMA,
      kcu.TABLE_NAME,
      kcu.CONSTRAINT_NAME,
      kcu.COLUMN_NAME,
      kcu.REFERENCED_TABLE_SCHEMA,
      kcu.REFERENCED_TABLE_NAME,
      kcu.REFERENCED_COLUMN_NAME,
      rc.UPDATE_RULE,
      rc.DELETE_RULE
  FROM 
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  LEFT JOIN 
      information_schema.referential_constraints rc 
      ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
  WHERE kcu.TABLE_SCHEMA = '${inputSchema}' AND kcu.CONSTRAINT_NAME != 'PRIMARY' 
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL;`,
		);

		const fkRows = fks as RowDataPacket[];

		for (const fkRow of fkRows) {
			foreignKeysCount += 1;
			if (progressCallback) {
				progressCallback('fks', foreignKeysCount, 'fetching');
			}
			const tableSchema = fkRow['TABLE_SCHEMA'];
			const tableName: string = fkRow['TABLE_NAME'];
			const constraintName = fkRow['CONSTRAINT_NAME'];
			const columnName: string = fkRow['COLUMN_NAME'];
			const refTableSchema = fkRow['REFERENCED_TABLE_SCHEMA'];
			const refTableName = fkRow['REFERENCED_TABLE_NAME'];
			const refColumnName: string = fkRow['REFERENCED_COLUMN_NAME'];
			const updateRule: string = fkRow['UPDATE_RULE'];
			const deleteRule = fkRow['DELETE_RULE'];

			const tableInResult = result[tableName];
			if (typeof tableInResult === 'undefined') continue;

			if (typeof tableInResult.foreignKeys[constraintName] !== 'undefined') {
				tableInResult.foreignKeys[constraintName]!.columnsFrom.push(columnName);
				tableInResult.foreignKeys[constraintName]!.columnsTo.push(
					refColumnName,
				);
			} else {
				tableInResult.foreignKeys[constraintName] = {
					name: constraintName,
					tableFrom: tableName,
					tableTo: refTableName,
					columnsFrom: [columnName],
					columnsTo: [refColumnName],
					onDelete: deleteRule?.toLowerCase(),
					onUpdate: updateRule?.toLowerCase(),
				};
			}

			tableInResult.foreignKeys[constraintName]!.columnsFrom = [
				...new Set(tableInResult.foreignKeys[constraintName]!.columnsFrom),
			];

			tableInResult.foreignKeys[constraintName]!.columnsTo = [
				...new Set(tableInResult.foreignKeys[constraintName]!.columnsTo),
			];
		}
	} catch (e) {
		// console.log(`Can't proccess foreign keys`);
	}
	if (progressCallback) {
		progressCallback('fks', foreignKeysCount, 'done');
	}

	for (const idxRow of idxRows) {
		const tableSchema = idxRow['TABLE_SCHEMA'];
		const tableName = idxRow['TABLE_NAME'];
		const constraintName = idxRow['INDEX_NAME'];
		const columnName: string = idxRow['COLUMN_NAME'];
		const isUnique = idxRow['NON_UNIQUE'] === 0;

		const tableInResult = result[tableName];
		if (typeof tableInResult === 'undefined') continue;

		// if (tableInResult.columns[columnName].type === "serial") continue;

		indexesCount += 1;
		if (progressCallback) {
			progressCallback('indexes', indexesCount, 'fetching');
		}

		if (isUnique) {
			if (
				typeof tableInResult.uniqueConstraints[constraintName] !== 'undefined'
			) {
				tableInResult.uniqueConstraints[constraintName]!.columns.push(
					columnName,
				);
			} else {
				tableInResult.uniqueConstraints[constraintName] = {
					name: constraintName,
					columns: [columnName],
				};
			}
		} else {
			// in MySQL FK creates index by default. Name of index is the same as fk constraint name
			// so for introspect we will just skip it
			if (typeof tableInResult.foreignKeys[constraintName] === 'undefined') {
				if (typeof tableInResult.indexes[constraintName] !== 'undefined') {
					tableInResult.indexes[constraintName]!.columns.push(columnName);
				} else {
					tableInResult.indexes[constraintName] = {
						name: constraintName,
						columns: [columnName],
						isUnique: isUnique,
					};
				}
			}
		}
	}

	if (progressCallback) {
		progressCallback('indexes', indexesCount, 'done');
		// progressCallback("enums", 0, "fetching");
		progressCallback('enums', 0, 'done');
	}

	return {
		version: '5',
		dialect: 'mysql',
		tables: result,
		_meta: {
			tables: {},
			columns: {},
		},
		internal: internals,
	};
};
