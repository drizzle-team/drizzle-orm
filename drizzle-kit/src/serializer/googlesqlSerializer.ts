import chalk from 'chalk';
import { getTableName, is, SQL } from 'drizzle-orm';
import {
	AnyGoogleSqlTable,
	getTableConfig,
	getViewConfig,
	GoogleSqlColumn,
	GoogleSqlDialect,
	GoogleSqlView,
	type PrimaryKey as PrimaryKeyORM,
} from 'drizzle-orm/googlesql';
import { CasingType } from 'src/cli/validations/common';
import { withStyle } from '../cli/validations/outputs';
import { IntrospectStage, IntrospectStatus } from '../cli/views';
import {
	CheckConstraint,
	Column,
	ForeignKey,
	GoogleSqlKitInternals,
	GoogleSqlSchemaInternal,
	Index,
	PrimaryKey,
	Table,
	View,
} from '../serializer/googlesqlSchema';
import { type DB, escapeSingleQuotesGooglesql } from '../utils';
import { getColumnCasing, sqlToStr } from './utils';

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export const generateGoogleSqlSnapshot = (
	tables: AnyGoogleSqlTable[],
	views: GoogleSqlView[],
	casing: CasingType | undefined,
): GoogleSqlSchemaInternal => {
	const dialect = new GoogleSqlDialect({ casing });
	const result: Record<string, Table> = {};
	const resultViews: Record<string, View> = {};
	const internal: GoogleSqlKitInternals = { tables: {}, indexes: {} };

	for (const table of tables) {
		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys,
			schema,
			checks,
			primaryKeys,
		} = getTableConfig(table);

		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const foreignKeysObject: Record<string, ForeignKey> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const checkConstraintObject: Record<string, CheckConstraint> = {};

		// this object will help to identify same check names
		let checksInTable: Record<string, string[]> = {};

		columns.forEach((column) => {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const sqlType = column.getSQLType();
			const sqlTypeLowered = sqlType.toLowerCase();

			const generated = column.generated;

			const columnToSet: Column = {
				name,
				type: sqlType,
				primaryKey: false,
				// If field is autoincrement it's notNull by default
				// notNull: autoIncrement ? true : notNull,
				notNull,
				// autoincrement: false,
				onUpdate: (column as any).hasOnUpdateNow,
				generated: generated
					? {
						as: is(generated.as, SQL)
							? dialect.sqlToQuery(generated.as as SQL, 'indexes').sql // TODO: SPANNER - should we create a new invoke source for this, instead of using "indexes"? maybe "generated"?
							: typeof generated.as === 'function'
							? dialect.sqlToQuery(generated.as() as SQL, 'indexes').sql
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
				console.log(
					`\n${
						withStyle.errorWarning(`IsUnique is not supported in GoogleSQL. It's certainly a bug, please report it.`)
					}`,
				);
				process.exit(1);
			}

			if (column.default !== undefined) {
				if (is(column.default, SQL)) {
					columnToSet.default = sqlToStr(column.default, casing);
				} else {
					if (typeof column.default === 'string') {
						columnToSet.default = `'${escapeSingleQuotesGooglesql(column.default)}'`;
					} else {
						if (sqlTypeLowered === 'json') {
							columnToSet.default = `JSON '${JSON.stringify(column.default)}'`;
						} else if (column.default instanceof Date) {
							if (sqlTypeLowered === 'date') {
								columnToSet.default = `'${column.default.toISOString().split('T')[0]}'`;
							} else if (
								sqlTypeLowered.startsWith('timestamp')
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

					columnToSet.default = `(${columnToSet.default})`;
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

		const fks: ForeignKey[] = foreignKeys.map((fk) => {
			const tableFrom = tableName;
			const onDelete = fk.onDelete ?? 'no action';
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

			if (typeof foreignKeysObject[name] !== 'undefined') {
				console.log(
					`\n${
						withStyle.errorWarning(
							`In GoogleSQL, when creating a foreign key, an index is automatically generated with the same name as the foreign key constraint.\n\nWe have encountered a collision between the index name on columns ${
								// TODO: SPANNER - verify if this error message is correct
								chalk.underline.blue(
									indexColumns.join(','),
								)} and the foreign key on columns ${
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

			indexesObject[name] = {
				name,
				columns: indexColumns,
				isUnique: value.config.unique ?? false,
			};
		});

		checks.forEach((check) => {
			check;
			const checkName = check.name;
			if (typeof checksInTable[tableName] !== 'undefined') {
				if (checksInTable[tableName].includes(check.name)) {
					console.log(
						`\n${
							withStyle.errorWarning(
								`We\'ve found duplicated check constraint name in ${
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
			sqlSecurity,
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
			if (is(selectedFields[key], GoogleSqlColumn)) {
				const column = selectedFields[key];

				const notNull: boolean = column.notNull;
				const sqlTypeLowered = column.getSQLType().toLowerCase();

				const generated = column.generated;

				const columnToSet: Column = {
					name: column.name,
					type: column.getSQLType(),
					primaryKey: false,
					// If field is autoincrement it's notNull by default
					// notNull: autoIncrement ? true : notNull,
					notNull,
					onUpdate: (column as any).hasOnUpdateNow,
					generated: generated
						? {
							as: is(generated.as, SQL)
								? dialect.sqlToQuery(generated.as as SQL, 'indexes').sql
								: typeof generated.as === 'function'
								? dialect.sqlToQuery(generated.as() as SQL, 'indexes').sql
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
								columnToSet.default = `JSON '${JSON.stringify(column.default)}'`;
							} else if (column.default instanceof Date) {
								if (sqlTypeLowered === 'date') {
									columnToSet.default = `'${column.default.toISOString().split('T')[0]}'`;
								} else if (
									sqlTypeLowered.startsWith('timestamp')
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
						columnToSet.default = `(${columnToSet.default})`;
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
			sqlSecurity: sqlSecurity ?? 'definer', // set default values
		};
	}

	return {
		version: '0',
		dialect: 'googlesql',
		tables: result,
		views: resultViews,
		schemas: {}, // TODO: SPANNER - verify
		_meta: {
			tables: {},
			columns: {},
			schemas: {}, // TODO: SPANNER - verify
		},
		internal,
	};
};

export const fromDatabase = async (
	db: DB,
	inputSchema: string,
	tablesFilter: (table: string) => boolean = (table) => true,
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void,
): Promise<GoogleSqlSchemaInternal> => {
	throw new Error('Not implemented.');
};
