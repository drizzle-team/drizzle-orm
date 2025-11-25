import chalk from 'chalk';
import { is, SQL } from 'drizzle-orm';
import {
	AnySingleStoreTable,
	getTableConfig,
	type PrimaryKey as PrimaryKeyORM,
	SingleStoreDialect,
	uniqueKeyName,
} from 'drizzle-orm/singlestore-core';
import { RowDataPacket } from 'mysql2/promise';
import { withStyle } from '../cli/validations/outputs';
import { IntrospectStage, IntrospectStatus } from '../cli/views';

import { CasingType } from 'src/cli/validations/common';
import type { DB } from '../utils';
import {
	Column,
	Index,
	PrimaryKey,
	SingleStoreKitInternals,
	SingleStoreSchemaInternal,
	Table,
	UniqueConstraint,
} from './singlestoreSchema';
import { sqlToStr } from './utils';

const dialect = new SingleStoreDialect();

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export const generateSingleStoreSnapshot = (
	tables: AnySingleStoreTable[],
	/* views: SingleStoreView[], */
	casing: CasingType | undefined,
): SingleStoreSchemaInternal => {
	const dialect = new SingleStoreDialect({ casing });
	const result: Record<string, Table> = {};
	/* const resultViews: Record<string, View> = {}; */
	const internal: SingleStoreKitInternals = { tables: {}, indexes: {} };
	for (const table of tables) {
		const {
			name: tableName,
			columns,
			indexes,
			schema,
			primaryKeys,
			uniqueConstraints,
		} = getTableConfig(table);
		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};

		columns.forEach((column) => {
			const notNull: boolean = column.notNull;
			const sqlTypeLowered = column.getSQLType().toLowerCase();
			const autoIncrement = typeof (column as any).autoIncrement === 'undefined'
				? false
				: (column as any).autoIncrement;

			const generated = column.generated;

			const columnToSet: Column = {
				name: column.name,
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
				primaryKeysObject[`${tableName}_${column.name}`] = {
					name: `${tableName}_${column.name}`,
					columns: [column.name],
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
						if (sqlTypeLowered === 'json' || Array.isArray(column.default)) {
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
					// if (['blob', 'text', 'json'].includes(column.getSQLType())) {
					// 	columnToSet.default = `(${columnToSet.default})`;
					// }
				}
			}
			columnsObject[column.name] = columnToSet;
		});

		primaryKeys.map((pk: PrimaryKeyORM) => {
			const columnNames = pk.columns.map((c: any) => c.name);
			primaryKeysObject[pk.getName()] = {
				name: pk.getName(),
				columns: columnNames,
			};

			// all composite pk's should be treated as notNull
			for (const column of pk.columns) {
				columnsObject[column.name].notNull = true;
			}
		});

		uniqueConstraints?.map((unq) => {
			const columnNames = unq.columns.map((c) => c.name);

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
					return `${it.name}`;
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
			}

			indexesObject[name] = {
				name,
				columns: indexColumns,
				isUnique: value.config.unique ?? false,
				using: value.config.using,
				algorithm: value.config.algorithm,
				lock: value.config.lock,
			};
		});

		// only handle tables without schemas
		if (!schema) {
			result[tableName] = {
				name: tableName,
				columns: columnsObject,
				indexes: indexesObject,
				compositePrimaryKeys: primaryKeysObject,
				uniqueConstraints: uniqueConstraintObject,
			};
		}
	}

	/* for (const view of views) {
		const {
			isExisting,
			name,
			query,
			schema,
			selectedFields,
			algorithm,
			sqlSecurity,
			withCheckOption,
		} = getViewConfig(view);

		const columnsObject: Record<string, Column> = {};

		const existingView = resultViews[name];
		if (typeof existingView !== 'undefined') {
			console.log(
				`\n${
					withStyle.errorWarning(
						`We\'ve found duplicated view name across ${
							chalk.underline.blue(
								schema ?? 'public',
							)
						} schema. Please rename your view`,
					)
				}`,
			);
			process.exit(1);
		}
		for (const key in selectedFields) {
			if (is(selectedFields[key], SingleStoreColumn)) {
				const column = selectedFields[key];

				const notNull: boolean = column.notNull;
				const sqlTypeLowered = column.getSQLType().toLowerCase();
				const autoIncrement = typeof (column as any).autoIncrement === 'undefined'
					? false
					: (column as any).autoIncrement;

				const generated = column.generated;

				const columnToSet: Column = {
					name: column.name,
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
					}
				}
				columnsObject[column.name] = columnToSet;
			}
		}

		resultViews[name] = {
			columns: columnsObject,
			name,
			isExisting,
			definition: isExisting ? undefined : dialect.sqlToQuery(query!).sql,
			withCheckOption,
			algorithm: algorithm ?? 'undefined', // set default values
			sqlSecurity: sqlSecurity ?? 'definer', // set default values
		};
	} */

	return {
		version: '1',
		dialect: 'singlestore',
		tables: result,
		/* views: resultViews, */
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
): Promise<SingleStoreSchemaInternal> => {
	const result: Record<string, Table> = {};
	const internals: SingleStoreKitInternals = { tables: {}, indexes: {} };

	const columns = await db.query(`select * from information_schema.columns
	where table_schema = '${inputSchema}' and table_name != '__drizzle_migrations'
	order by table_name, ordinal_position;`);

	const response = columns as RowDataPacket[];

	const schemas: string[] = [];

	let columnsCount = 0;
	let tablesCount = new Set();
	let indexesCount = 0;
	/* let viewsCount = 0; */

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
		// const columnType = column["DATA_TYPE"];
		const isPrimary = column['COLUMN_KEY'] === 'PRI'; // 'PRI', ''
		let columnDefault: string | null = column['COLUMN_DEFAULT'];
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

		if (
			columnType.startsWith('bigint(')
			|| columnType.startsWith('tinyint(')
			|| columnType.startsWith('date(')
			|| columnType.startsWith('int(')
			|| columnType.startsWith('mediumint(')
			|| columnType.startsWith('smallint(')
			|| columnType.startsWith('text(')
			|| columnType.startsWith('time(')
			|| columnType.startsWith('year(')
		) {
			changedType = columnType.replace(/\(\s*[^)]*\)$/, '');
		}

		if (columnType.includes('decimal(10,0)')) {
			changedType = columnType.replace('decimal(10,0)', 'decimal');
		}

		if (columnDefault?.endsWith('.')) {
			columnDefault = columnDefault.slice(0, -1);
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
				: columnDefault.startsWith('CURRENT_TIMESTAMP')
				? 'CURRENT_TIMESTAMP'
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
  WHERE t.constraint_type='UNIQUE'
      and table_name != '__drizzle_migrations'
      AND t.table_schema = '${inputSchema}'
      ORDER BY ordinal_position`,
	);

	const tableToPk: { [tname: string]: string[] } = {};

	const tableToPkRows = tablePks as RowDataPacket[];
	for (const tableToPkRow of tableToPkRows) {
		const tableName: string = tableToPkRow['table_name'];
		const columnName: string = tableToPkRow['column_name'];
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
		}
	}

	/* const views = await db.query(
		`select * from INFORMATION_SCHEMA.VIEWS WHERE table_schema = '${inputSchema}';`,
	); */

	/* const resultViews: Record<string, View> = {}; */

	/* viewsCount = views.length;
	if (progressCallback) {
		progressCallback('views', viewsCount, 'fetching');
	}
	for await (const view of views) {
		const viewName = view['TABLE_NAME'];
		const definition = view['VIEW_DEFINITION'];

		const withCheckOption = view['CHECK_OPTION'] === 'NONE'
			? undefined
			: view['CHECK_OPTION'].toLowerCase();
		const sqlSecurity = view['SECURITY_TYPE'].toLowerCase();

		const [createSqlStatement] = await db.query(
			`SHOW CREATE VIEW \`${viewName}\`;`,
		);
		const algorithmMatch = createSqlStatement['Create View'].match(/ALGORITHM=([^ ]+)/);
		const algorithm = algorithmMatch
			? algorithmMatch[1].toLowerCase()
			: undefined;

		const columns = result[viewName].columns;
		delete result[viewName];

		resultViews[viewName] = {
			columns: columns,
			isExisting: false,
			name: viewName,
			algorithm,
			definition,
			sqlSecurity,
			withCheckOption,
		};
	} */

	if (progressCallback) {
		progressCallback('indexes', indexesCount, 'done');
		// progressCallback("enums", 0, "fetching");
		progressCallback('enums', 0, 'done');
	}

	return {
		version: '1',
		dialect: 'singlestore',
		tables: result,
		/* views: resultViews, */
		_meta: {
			tables: {},
			columns: {},
		},
		internal: internals,
	};
};
