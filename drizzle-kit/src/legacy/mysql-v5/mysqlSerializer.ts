import chalk from 'chalk';
import { getTableName, is, SQL } from 'orm044';
import type { AnyMySqlTable, MySqlView } from 'orm044/mysql-core';
import {
	getTableConfig,
	getViewConfig,
	MySqlColumn,
	MySqlDialect,
	type PrimaryKey as PrimaryKeyORM,
	uniqueKeyName,
} from 'orm044/mysql-core';
import type { CasingType } from 'src/cli/validations/common';
import { withStyle } from '../outputs';
import { escapeSingleQuotes } from '../utils';
import { getColumnCasing, sqlToStr } from '../utils';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	MySqlKitInternals,
	MySqlSchemaInternal,
	PrimaryKey,
	Table,
	UniqueConstraint,
	View,
} from './mysqlSchema';

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

const handleEnumType = (type: string) => {
	let str = type.split('(')[1];
	str = str.substring(0, str.length - 1);
	const values = str.split(',').map((v) => `'${escapeSingleQuotes(v.substring(1, v.length - 1))}'`);
	return `enum(${values.join(',')})`;
};

export const generateMySqlSnapshot = (
	tables: AnyMySqlTable[],
	views: MySqlView[],
	casing: CasingType | undefined,
): MySqlSchemaInternal => {
	const dialect = new MySqlDialect({ casing });
	const result: Record<string, Table> = {};
	const resultViews: Record<string, View> = {};
	const internal: MySqlKitInternals = { tables: {}, indexes: {} };

	for (const table of tables) {
		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys,
			schema,
			checks,
			primaryKeys,
			uniqueConstraints,
		} = getTableConfig(table);

		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const foreignKeysObject: Record<string, ForeignKey> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};
		const checkConstraintObject: Record<string, CheckConstraint> = {};

		// this object will help to identify same check names
		let checksInTable: Record<string, string[]> = {};

		columns.forEach((column) => {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const sqlType = column.getSQLType();
			const sqlTypeLowered = sqlType.toLowerCase();
			const autoIncrement = typeof (column as any).autoIncrement === 'undefined'
				? false
				: (column as any).autoIncrement;

			const generated = column.generated;

			const columnToSet: Column = {
				name,
				type: sqlType.startsWith('enum') ? handleEnumType(sqlType) : sqlType,
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
							withStyle.errorWarning(`We've found duplicated unique constraint names in ${
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
						columnToSet.default = `'${escapeSingleQuotes(column.default)}'`;
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
							`We've found duplicated unique constraint names in ${
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
								`We've found duplicated unique constraint names in ${
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

		checks.forEach((check) => {
			const checkName = check.name;
			if (typeof checksInTable[tableName] !== 'undefined') {
				if (checksInTable[tableName].includes(check.name)) {
					console.log(
						`\n${
							withStyle.errorWarning(
								`We've found duplicated check constraint name in ${
									chalk.underline.blue(
										tableName,
									)
								}. Please rename your check constraint in the ${
									chalk.underline.blue(
										tableName,
									)
								} table`,
							)
						}`,
					);
					process.exit(1);
				}
				checksInTable[tableName].push(checkName);
			} else {
				checksInTable[tableName] = [check.name];
			}

			checkConstraintObject[checkName] = {
				name: checkName,
				value: dialect.sqlToQuery(check.value).sql,
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
				checkConstraint: checkConstraintObject,
			};
		}
	}

	for (const view of views) {
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
						`We've found duplicated view name across ${
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
			if (is(selectedFields[key], MySqlColumn)) {
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
						if (['blob', 'text', 'json'].includes(column.getSQLType())) {
							columnToSet.default = `(${columnToSet.default})`;
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
	}

	return {
		version: '5',
		dialect: 'mysql',
		tables: result,
		views: resultViews,
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};

// function clearDefaults(defaultValue: any, collate: string) {
// 	if (typeof collate === 'undefined' || collate === null) {
// 		collate = `utf8mb4`;
// 	}

// 	let resultDefault = defaultValue;
// 	collate = `_${collate}`;
// 	if (defaultValue.startsWith(collate)) {
// 		resultDefault = resultDefault
// 			.substring(collate.length, defaultValue.length)
// 			.replace(/\\/g, '');
// 		if (resultDefault.startsWith("'") && resultDefault.endsWith("'")) {
// 			return `('${escapeSingleQuotes(resultDefault.substring(1, resultDefault.length - 1))}')`;
// 		} else {
// 			return `'${escapeSingleQuotes(resultDefault.substring(1, resultDefault.length - 1))}'`;
// 		}
// 	} else {
// 		return `(${resultDefault})`;
// 	}
// }
