import chalk from 'chalk';
import { getTableName, is, SQL } from 'drizzle-orm';
import {
	AnyPgTable,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	IndexedColumn,
	PgArray,
	PgColumn,
	PgDialect,
	PgEnum,
	PgEnumColumn,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgView,
	uniqueKeyName,
} from 'drizzle-orm/pg-core';
import { CasingType } from 'src/cli/validations/common';
import { vectorOps } from 'src/extensions/vector';
import { withStyle } from '../cli/validations/outputs';
import type { IntrospectStage, IntrospectStatus } from '../cli/views';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	IndexColumnType,
	PgKitInternals,
	PgSchemaInternal,
	Policy,
	PrimaryKey,
	Role,
	Sequence,
	Table,
	UniqueConstraint,
	View,
} from '../serializer/pgSchema';
import { type DB, escapeSingleQuotes, isPgArrayType } from '../utils';
import { getColumnCasing, sqlToStr } from './utils';

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

function stringFromIdentityProperty(field: string | number | undefined): string | undefined {
	return typeof field === 'string' ? (field as string) : typeof field === 'undefined' ? undefined : String(field);
}

function maxRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '2147483647' : columnType === 'bigint' ? '9223372036854775807' : '32767';
}

function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '-2147483648' : columnType === 'bigint' ? '-9223372036854775808' : '-32768';
}

function stringFromDatabaseIdentityProperty(field: any): string | undefined {
	return typeof field === 'string'
		? (field as string)
		: typeof field === 'undefined'
		? undefined
		: typeof field === 'bigint'
		? field.toString()
		: String(field);
}

export function buildArrayString(array: any[], sqlType: string): string {
	sqlType = sqlType.split('[')[0];
	const values = array
		.map((value) => {
			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			} else if (typeof value === 'boolean') {
				return value ? 'true' : 'false';
			} else if (Array.isArray(value)) {
				return buildArrayString(value, sqlType);
			} else if (value instanceof Date) {
				if (sqlType === 'date') {
					return `"${value.toISOString().split('T')[0]}"`;
				} else if (sqlType === 'timestamp') {
					return `"${value.toISOString().replace('T', ' ').slice(0, 23)}"`;
				} else {
					return `"${value.toISOString()}"`;
				}
			} else if (typeof value === 'object') {
				return `"${JSON.stringify(value).replaceAll('"', '\\"')}"`;
			}

			return `"${value}"`;
		})
		.join(',');

	return `{${values}}`;
}

export const generatePgSnapshot = (
	tables: AnyPgTable[],
	enums: PgEnum<any>[],
	schemas: PgSchema[],
	sequences: PgSequence[],
	roles: PgRole[],
	policies: PgPolicy[],
	views: PgView[],
	matViews: PgMaterializedView[],
	casing: CasingType | undefined,
	schemaFilter?: string[],
): PgSchemaInternal => {
	const dialect = new PgDialect({ casing });
	const result: Record<string, Table> = {};
	const resultViews: Record<string, View> = {};
	const sequencesToReturn: Record<string, Sequence> = {};
	const rolesToReturn: Record<string, Role> = {};
	// this policies are a separate objects that were linked to a table outside of it
	const policiesToReturn: Record<string, Policy> = {};

	// This object stores unique names for indexes and will be used to detect if you have the same names for indexes
	// within the same PostgreSQL schema

	const indexesInSchema: Record<string, string[]> = {};

	for (const table of tables) {
		// This object stores unique names for checks and will be used to detect if you have the same names for checks
		// within the same PostgreSQL table
		const checksInTable: Record<string, string[]> = {};

		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys,
			checks,
			schema,
			primaryKeys,
			uniqueConstraints,
			policies,
			enableRLS,
		} = getTableConfig(table);

		if (schemaFilter && !schemaFilter.includes(schema ?? 'public')) {
			continue;
		}

		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const checksObject: Record<string, CheckConstraint> = {};
		const foreignKeysObject: Record<string, ForeignKey> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};
		const policiesObject: Record<string, Policy> = {};

		columns.forEach((column) => {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const primaryKey: boolean = column.primary;
			const sqlTypeLowered = column.getSQLType().toLowerCase();

			const getEnumSchema = (column: PgColumn) => {
				while (is(column, PgArray)) {
					column = column.baseColumn;
				}
				return is(column, PgEnumColumn) ? column.enum.schema || 'public' : undefined;
			};
			const typeSchema: string | undefined = getEnumSchema(column);

			const generated = column.generated;
			const identity = column.generatedIdentity;

			const increment = stringFromIdentityProperty(identity?.sequenceOptions?.increment) ?? '1';
			const minValue = stringFromIdentityProperty(identity?.sequenceOptions?.minValue)
				?? (parseFloat(increment) < 0 ? minRangeForIdentityBasedOn(column.columnType) : '1');
			const maxValue = stringFromIdentityProperty(identity?.sequenceOptions?.maxValue)
				?? (parseFloat(increment) < 0 ? '-1' : maxRangeForIdentityBasedOn(column.getSQLType()));
			const startWith = stringFromIdentityProperty(identity?.sequenceOptions?.startWith)
				?? (parseFloat(increment) < 0 ? maxValue : minValue);
			const cache = stringFromIdentityProperty(identity?.sequenceOptions?.cache) ?? '1';

			const columnToSet: Column = {
				name,
				type: column.getSQLType(),
				typeSchema: typeSchema,
				primaryKey,
				notNull,
				generated: generated
					? {
						as: is(generated.as, SQL)
							? dialect.sqlToQuery(generated.as as SQL).sql
							: typeof generated.as === 'function'
							? dialect.sqlToQuery(generated.as() as SQL).sql
							: (generated.as as any),
						type: 'stored',
					}
					: undefined,
				identity: identity
					? {
						type: identity.type,
						name: identity.sequenceName ?? `${tableName}_${name}_seq`,
						schema: schema ?? 'public',
						increment,
						startWith,
						minValue,
						maxValue,
						cache,
						cycle: identity?.sequenceOptions?.cycle ?? false,
					}
					: undefined,
			};

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
							} column is conflicting with a unique constraint name already defined for ${
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
					nullsNotDistinct: column.uniqueType === 'not distinct',
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
						if (sqlTypeLowered === 'jsonb' || sqlTypeLowered === 'json') {
							columnToSet.default = `'${JSON.stringify(column.default)}'::${sqlTypeLowered}`;
						} else if (column.default instanceof Date) {
							if (sqlTypeLowered === 'date') {
								columnToSet.default = `'${column.default.toISOString().split('T')[0]}'`;
							} else if (sqlTypeLowered === 'timestamp') {
								columnToSet.default = `'${column.default.toISOString().replace('T', ' ').slice(0, 23)}'`;
							} else {
								columnToSet.default = `'${column.default.toISOString()}'`;
							}
						} else if (isPgArrayType(sqlTypeLowered) && Array.isArray(column.default)) {
							columnToSet.default = `'${buildArrayString(column.default, sqlTypeLowered)}'`;
						} else {
							// Should do for all types
							// columnToSet.default = `'${column.default}'::${sqlTypeLowered}`;
							columnToSet.default = column.default;
						}
					}
				}
			}
			columnsObject[name] = columnToSet;
		});

		primaryKeys.map((pk) => {
			const originalColumnNames = pk.columns.map((c) => c.name);
			const columnNames = pk.columns.map((c) => getColumnCasing(c, casing));

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
		});

		uniqueConstraints?.map((unq) => {
			const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));

			const name = unq.name ?? uniqueKeyName(table, columnNames);

			const existingUnique = uniqueConstraintObject[name];
			if (typeof existingUnique !== 'undefined') {
				console.log(
					`\n${
						withStyle.errorWarning(
							`We\'ve found duplicated unique constraint names in ${chalk.underline.blue(tableName)} table. 
        The unique constraint ${chalk.underline.blue(name)} on the ${
								chalk.underline.blue(
									columnNames.join(','),
								)
							} columns is confilcting with a unique constraint name already defined for ${
								chalk.underline.blue(existingUnique.columns.join(','))
							} columns\n`,
						)
					}`,
				);
				process.exit(1);
			}

			uniqueConstraintObject[name] = {
				name: unq.name!,
				nullsNotDistinct: unq.nullsNotDistinct,
				columns: columnNames,
			};
		});

		const fks: ForeignKey[] = foreignKeys.map((fk) => {
			const tableFrom = tableName;
			const onDelete = fk.onDelete;
			const onUpdate = fk.onUpdate;
			const reference = fk.reference();

			const tableTo = getTableName(reference.foreignTable);
			// TODO: resolve issue with schema undefined/public for db push(or squasher)
			// getTableConfig(reference.foreignTable).schema || "public";
			const schemaTo = getTableConfig(reference.foreignTable).schema;

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
				schemaTo,
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

			let indexColumnNames: string[] = [];
			columns.forEach((it) => {
				if (is(it, SQL)) {
					if (typeof value.config.name === 'undefined') {
						console.log(
							`\n${
								withStyle.errorWarning(
									`Please specify an index name in ${getTableName(value.config.table)} table that has "${
										dialect.sqlToQuery(it).sql
									}" expression. We can generate index names for indexes on columns only; for expressions in indexes, you need to specify the name yourself.`,
								)
							}`,
						);
						process.exit(1);
					}
				}
				it = it as IndexedColumn;
				const name = getColumnCasing(it as IndexedColumn, casing);
				if (
					!is(it, SQL)
					&& it.type! === 'PgVector'
					&& typeof it.indexConfig!.opClass === 'undefined'
				) {
					console.log(
						`\n${
							withStyle.errorWarning(
								`You are specifying an index on the ${
									chalk.blueBright(
										name,
									)
								} column inside the ${
									chalk.blueBright(
										tableName,
									)
								} table with the ${
									chalk.blueBright(
										'vector',
									)
								} type without specifying an operator class. Vector extension doesn't have a default operator class, so you need to specify one of the available options. Here is a list of available op classes for the vector extension: [${
									vectorOps
										.map((it) => `${chalk.underline(`${it}`)}`)
										.join(', ')
								}].\n\nYou can specify it using current syntax: ${
									chalk.underline(
										`index("${value.config.name}").using("${value.config.method}", table.${name}.op("${
											vectorOps[0]
										}"))`,
									)
								}\n\nYou can check the "pg_vector" docs for more info: https://github.com/pgvector/pgvector?tab=readme-ov-file#indexing\n`,
							)
						}`,
					);
					process.exit(1);
				}
				indexColumnNames.push(name);
			});

			const name = value.config.name ? value.config.name : indexName(tableName, indexColumnNames);

			let indexColumns: IndexColumnType[] = columns.map(
				(it): IndexColumnType => {
					if (is(it, SQL)) {
						return {
							expression: dialect.sqlToQuery(it, 'indexes').sql,
							asc: true,
							isExpression: true,
							nulls: 'last',
						};
					} else {
						it = it as IndexedColumn;
						return {
							expression: getColumnCasing(it as IndexedColumn, casing),
							isExpression: false,
							asc: it.indexConfig?.order === 'asc',
							nulls: it.indexConfig?.nulls
								? it.indexConfig?.nulls
								: it.indexConfig?.order === 'desc'
								? 'first'
								: 'last',
							opclass: it.indexConfig?.opClass,
						};
					}
				},
			);

			// check for index names duplicates
			if (typeof indexesInSchema[schema ?? 'public'] !== 'undefined') {
				if (indexesInSchema[schema ?? 'public'].includes(name)) {
					console.log(
						`\n${
							withStyle.errorWarning(
								`We\'ve found duplicated index name across ${
									chalk.underline.blue(schema ?? 'public')
								} schema. Please rename your index in either the ${
									chalk.underline.blue(
										tableName,
									)
								} table or the table with the duplicated index name`,
							)
						}`,
					);
					process.exit(1);
				}
				indexesInSchema[schema ?? 'public'].push(name);
			} else {
				indexesInSchema[schema ?? 'public'] = [name];
			}

			indexesObject[name] = {
				name,
				columns: indexColumns,
				isUnique: value.config.unique ?? false,
				where: value.config.where ? dialect.sqlToQuery(value.config.where).sql : undefined,
				concurrently: value.config.concurrently ?? false,
				method: value.config.method ?? 'btree',
				with: value.config.with ?? {},
			};
		});

		policies.forEach((policy) => {
			const mappedTo = [];

			if (!policy.to) {
				mappedTo.push('public');
			} else {
				if (policy.to && typeof policy.to === 'string') {
					mappedTo.push(policy.to);
				} else if (policy.to && is(policy.to, PgRole)) {
					mappedTo.push(policy.to.name);
				} else if (policy.to && Array.isArray(policy.to)) {
					policy.to.forEach((it) => {
						if (typeof it === 'string') {
							mappedTo.push(it);
						} else if (is(it, PgRole)) {
							mappedTo.push(it.name);
						}
					});
				}
			}

			if (policiesObject[policy.name] !== undefined) {
				console.log(
					`\n${
						withStyle.errorWarning(
							`We\'ve found duplicated policy name across ${
								chalk.underline.blue(tableKey)
							} table. Please rename one of the policies with ${
								chalk.underline.blue(
									policy.name,
								)
							} name`,
						)
					}`,
				);
				process.exit(1);
			}

			policiesObject[policy.name] = {
				name: policy.name,
				as: policy.as?.toUpperCase() as Policy['as'] ?? 'PERMISSIVE',
				for: policy.for?.toUpperCase() as Policy['for'] ?? 'ALL',
				to: mappedTo.sort(),
				using: is(policy.using, SQL) ? dialect.sqlToQuery(policy.using).sql : undefined,
				withCheck: is(policy.withCheck, SQL) ? dialect.sqlToQuery(policy.withCheck).sql : undefined,
			};
		});

		checks.forEach((check) => {
			const checkName = check.name;

			if (typeof checksInTable[`"${schema ?? 'public'}"."${tableName}"`] !== 'undefined') {
				if (checksInTable[`"${schema ?? 'public'}"."${tableName}"`].includes(check.name)) {
					console.log(
						`\n${
							withStyle.errorWarning(
								`We\'ve found duplicated check constraint name across ${
									chalk.underline.blue(
										schema ?? 'public',
									)
								} schema in ${
									chalk.underline.blue(
										tableName,
									)
								}. Please rename your check constraint in either the ${
									chalk.underline.blue(
										tableName,
									)
								} table or the table with the duplicated check contraint name`,
							)
						}`,
					);
					process.exit(1);
				}
				checksInTable[`"${schema ?? 'public'}"."${tableName}"`].push(checkName);
			} else {
				checksInTable[`"${schema ?? 'public'}"."${tableName}"`] = [check.name];
			}

			checksObject[checkName] = {
				name: checkName,
				value: dialect.sqlToQuery(check.value).sql,
			};
		});

		const tableKey = `${schema ?? 'public'}.${tableName}`;

		result[tableKey] = {
			name: tableName,
			schema: schema ?? '',
			columns: columnsObject,
			indexes: indexesObject,
			foreignKeys: foreignKeysObject,
			compositePrimaryKeys: primaryKeysObject,
			uniqueConstraints: uniqueConstraintObject,
			policies: policiesObject,
			checkConstraints: checksObject,
			isRLSEnabled: enableRLS,
		};
	}

	for (const policy of policies) {
		// @ts-ignore
		if (!policy._linkedTable) {
			console.log(
				`\n${
					withStyle.errorWarning(
						`"Policy ${policy.name} was skipped because it was not linked to any table. You should either include the policy in a table or use .link() on the policy to link it to any table you have. For more information, please check:`,
					)
				}`,
			);
			continue;
		}

		// @ts-ignore
		const tableConfig = getTableConfig(policy._linkedTable);

		const tableKey = `${tableConfig.schema ?? 'public'}.${tableConfig.name}`;

		const mappedTo = [];

		if (!policy.to) {
			mappedTo.push('public');
		} else {
			if (policy.to && typeof policy.to === 'string') {
				mappedTo.push(policy.to);
			} else if (policy.to && is(policy.to, PgRole)) {
				mappedTo.push(policy.to.name);
			} else if (policy.to && Array.isArray(policy.to)) {
				policy.to.forEach((it) => {
					if (typeof it === 'string') {
						mappedTo.push(it);
					} else if (is(it, PgRole)) {
						mappedTo.push(it.name);
					}
				});
			}
		}

		// add separate policies object, that will be only responsible for policy creation
		// but we would need to track if a policy was enabled for a specific table or not
		// enable only if jsonStatements for enable rls was not already there + filter it

		if (result[tableKey]?.policies[policy.name] !== undefined || policiesToReturn[policy.name] !== undefined) {
			console.log(
				`\n${
					withStyle.errorWarning(
						`We\'ve found duplicated policy name across ${
							chalk.underline.blue(tableKey)
						} table. Please rename one of the policies with ${
							chalk.underline.blue(
								policy.name,
							)
						} name`,
					)
				}`,
			);
			process.exit(1);
		}

		const mappedPolicy = {
			name: policy.name,
			as: policy.as?.toUpperCase() as Policy['as'] ?? 'PERMISSIVE',
			for: policy.for?.toUpperCase() as Policy['for'] ?? 'ALL',
			to: mappedTo.sort(),
			using: is(policy.using, SQL) ? dialect.sqlToQuery(policy.using).sql : undefined,
			withCheck: is(policy.withCheck, SQL) ? dialect.sqlToQuery(policy.withCheck).sql : undefined,
		};

		if (result[tableKey]) {
			result[tableKey].policies[policy.name] = mappedPolicy;
		} else {
			policiesToReturn[policy.name] = {
				...mappedPolicy,
				schema: tableConfig.schema ?? 'public',
				on: `"${tableConfig.schema ?? 'public'}"."${tableConfig.name}"`,
			};
		}
	}

	for (const sequence of sequences) {
		const name = sequence.seqName!;
		if (typeof sequencesToReturn[`${sequence.schema ?? 'public'}.${name}`] === 'undefined') {
			const increment = stringFromIdentityProperty(sequence?.seqOptions?.increment) ?? '1';
			const minValue = stringFromIdentityProperty(sequence?.seqOptions?.minValue)
				?? (parseFloat(increment) < 0 ? '-9223372036854775808' : '1');
			const maxValue = stringFromIdentityProperty(sequence?.seqOptions?.maxValue)
				?? (parseFloat(increment) < 0 ? '-1' : '9223372036854775807');
			const startWith = stringFromIdentityProperty(sequence?.seqOptions?.startWith)
				?? (parseFloat(increment) < 0 ? maxValue : minValue);
			const cache = stringFromIdentityProperty(sequence?.seqOptions?.cache) ?? '1';

			sequencesToReturn[`${sequence.schema ?? 'public'}.${name}`] = {
				name,
				schema: sequence.schema ?? 'public',
				increment,
				startWith,
				minValue,
				maxValue,
				cache,
				cycle: sequence.seqOptions?.cycle ?? false,
			};
		} else {
			// duplicate seq error
		}
	}

	for (const role of roles) {
		if (!(role as any)._existing) {
			rolesToReturn[role.name] = {
				name: role.name,
				createDb: (role as any).createDb === undefined ? false : (role as any).createDb,
				createRole: (role as any).createRole === undefined ? false : (role as any).createRole,
				inherit: (role as any).inherit === undefined ? true : (role as any).inherit,
			};
		}
	}
	const combinedViews = [...views, ...matViews];
	for (const view of combinedViews) {
		let viewName;
		let schema;
		let query;
		let selectedFields;
		let isExisting;
		let withOption;
		let tablespace;
		let using;
		let withNoData;
		let materialized: boolean = false;

		if (is(view, PgView)) {
			({ name: viewName, schema, query, selectedFields, isExisting, with: withOption } = getViewConfig(view));
		} else {
			({ name: viewName, schema, query, selectedFields, isExisting, with: withOption, tablespace, using, withNoData } =
				getMaterializedViewConfig(view));

			materialized = true;
		}

		const viewSchema = schema ?? 'public';

		const viewKey = `${viewSchema}.${viewName}`;

		const columnsObject: Record<string, Column> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};

		const existingView = resultViews[viewKey];
		if (typeof existingView !== 'undefined') {
			console.log(
				`\n${
					withStyle.errorWarning(
						`We\'ve found duplicated view name across ${
							chalk.underline.blue(schema ?? 'public')
						} schema. Please rename your view`,
					)
				}`,
			);
			process.exit(1);
		}

		for (const key in selectedFields) {
			if (is(selectedFields[key], PgColumn)) {
				const column = selectedFields[key];

				const notNull: boolean = column.notNull;
				const primaryKey: boolean = column.primary;
				const sqlTypeLowered = column.getSQLType().toLowerCase();

				const typeSchema = is(column, PgEnumColumn) ? column.enum.schema || 'public' : undefined;
				const generated = column.generated;
				const identity = column.generatedIdentity;

				const increment = stringFromIdentityProperty(identity?.sequenceOptions?.increment) ?? '1';
				const minValue = stringFromIdentityProperty(identity?.sequenceOptions?.minValue)
					?? (parseFloat(increment) < 0 ? minRangeForIdentityBasedOn(column.columnType) : '1');
				const maxValue = stringFromIdentityProperty(identity?.sequenceOptions?.maxValue)
					?? (parseFloat(increment) < 0 ? '-1' : maxRangeForIdentityBasedOn(column.getSQLType()));
				const startWith = stringFromIdentityProperty(identity?.sequenceOptions?.startWith)
					?? (parseFloat(increment) < 0 ? maxValue : minValue);
				const cache = stringFromIdentityProperty(identity?.sequenceOptions?.cache) ?? '1';

				const columnToSet: Column = {
					name: column.name,
					type: column.getSQLType(),
					typeSchema: typeSchema,
					primaryKey,
					notNull,
					generated: generated
						? {
							as: is(generated.as, SQL)
								? dialect.sqlToQuery(generated.as as SQL).sql
								: typeof generated.as === 'function'
								? dialect.sqlToQuery(generated.as() as SQL).sql
								: (generated.as as any),
							type: 'stored',
						}
						: undefined,
					identity: identity
						? {
							type: identity.type,
							name: identity.sequenceName ?? `${viewName}_${column.name}_seq`,
							schema: schema ?? 'public',
							increment,
							startWith,
							minValue,
							maxValue,
							cache,
							cycle: identity?.sequenceOptions?.cycle ?? false,
						}
						: undefined,
				};

				if (column.isUnique) {
					const existingUnique = uniqueConstraintObject[column.uniqueName!];
					if (typeof existingUnique !== 'undefined') {
						console.log(
							`\n${
								withStyle.errorWarning(
									`We\'ve found duplicated unique constraint names in ${chalk.underline.blue(viewName)} table. 
          The unique constraint ${chalk.underline.blue(column.uniqueName)} on the ${
										chalk.underline.blue(
											column.name,
										)
									} column is confilcting with a unique constraint name already defined for ${
										chalk.underline.blue(existingUnique.columns.join(','))
									} columns\n`,
								)
							}`,
						);
						process.exit(1);
					}
					uniqueConstraintObject[column.uniqueName!] = {
						name: column.uniqueName!,
						nullsNotDistinct: column.uniqueType === 'not distinct',
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
							if (sqlTypeLowered === 'jsonb' || sqlTypeLowered === 'json') {
								columnToSet.default = `'${JSON.stringify(column.default)}'::${sqlTypeLowered}`;
							} else if (column.default instanceof Date) {
								if (sqlTypeLowered === 'date') {
									columnToSet.default = `'${column.default.toISOString().split('T')[0]}'`;
								} else if (sqlTypeLowered === 'timestamp') {
									columnToSet.default = `'${column.default.toISOString().replace('T', ' ').slice(0, 23)}'`;
								} else {
									columnToSet.default = `'${column.default.toISOString()}'`;
								}
							} else if (isPgArrayType(sqlTypeLowered) && Array.isArray(column.default)) {
								columnToSet.default = `'${buildArrayString(column.default, sqlTypeLowered)}'`;
							} else {
								// Should do for all types
								// columnToSet.default = `'${column.default}'::${sqlTypeLowered}`;
								columnToSet.default = column.default;
							}
						}
					}
				}
				columnsObject[column.name] = columnToSet;
			}
		}

		resultViews[viewKey] = {
			columns: columnsObject,
			definition: isExisting ? undefined : dialect.sqlToQuery(query!).sql,
			name: viewName,
			schema: viewSchema,
			isExisting,
			with: withOption,
			withNoData,
			materialized,
			tablespace,
			using,
		};
	}

	const enumsToReturn: Record<string, Enum> = enums.reduce<{
		[key: string]: Enum;
	}>((map, obj) => {
		const enumSchema = obj.schema || 'public';
		const key = `${enumSchema}.${obj.enumName}`;
		map[key] = {
			name: obj.enumName,
			schema: enumSchema,
			values: obj.enumValues,
		};
		return map;
	}, {});

	const schemasObject = Object.fromEntries(
		schemas
			.filter((it) => {
				if (schemaFilter) {
					return schemaFilter.includes(it.schemaName) && it.schemaName !== 'public';
				} else {
					return it.schemaName !== 'public';
				}
			})
			.map((it) => [it.schemaName, it.schemaName]),
	);

	return {
		version: '7',
		dialect: 'postgresql',
		tables: result,
		enums: enumsToReturn,
		schemas: schemasObject,
		sequences: sequencesToReturn,
		roles: rolesToReturn,
		policies: policiesToReturn,
		views: resultViews,
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	};
};

const trimChar = (str: string, char: string) => {
	let start = 0;
	let end = str.length;

	while (start < end && str[start] === char) ++start;
	while (end > start && str[end - 1] === char) --end;

	// this.toString() due to ava deep equal issue with String { "value" }
	return start > 0 || end < str.length ? str.substring(start, end) : str.toString();
};

function prepareRoles(entities?: {
	roles: boolean | {
		provider?: string | undefined;
		include?: string[] | undefined;
		exclude?: string[] | undefined;
	};
}) {
	let useRoles: boolean = false;
	const includeRoles: string[] = [];
	const excludeRoles: string[] = [];

	if (entities && entities.roles) {
		if (typeof entities.roles === 'object') {
			if (entities.roles.provider) {
				if (entities.roles.provider === 'supabase') {
					excludeRoles.push(...[
						'anon',
						'authenticator',
						'authenticated',
						'service_role',
						'supabase_auth_admin',
						'supabase_storage_admin',
						'dashboard_user',
						'supabase_admin',
					]);
				} else if (entities.roles.provider === 'neon') {
					excludeRoles.push(...['authenticated', 'anonymous']);
				}
			}
			if (entities.roles.include) {
				includeRoles.push(...entities.roles.include);
			}
			if (entities.roles.exclude) {
				excludeRoles.push(...entities.roles.exclude);
			}
		} else {
			useRoles = entities.roles;
		}
	}
	return { useRoles, includeRoles, excludeRoles };
}

export const fromDatabase = async (
	db: DB,
	tablesFilter: (table: string) => boolean = () => true,
	schemaFilters: string[],
	entities?: {
		roles: boolean | {
			provider?: string | undefined;
			include?: string[] | undefined;
			exclude?: string[] | undefined;
		};
	},
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void,
	tsSchema?: PgSchemaInternal,
): Promise<PgSchemaInternal> => {
	const result: Record<string, Table> = {};
	const views: Record<string, View> = {};
	const policies: Record<string, Policy> = {};
	const internals: PgKitInternals = { tables: {} };

	const where = schemaFilters.map((t) => `n.nspname = '${t}'`).join(' or ');

	const allTables = await db.query<{ table_schema: string; table_name: string; type: string; rls_enabled: boolean }>(
		`SELECT 
    n.nspname AS table_schema, 
    c.relname AS table_name, 
    CASE 
        WHEN c.relkind = 'r' THEN 'table'
        WHEN c.relkind = 'v' THEN 'view'
        WHEN c.relkind = 'm' THEN 'materialized_view'
    END AS type,
	c.relrowsecurity AS rls_enabled
FROM 
    pg_catalog.pg_class c
JOIN 
    pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE 
	c.relkind IN ('r', 'v', 'm') 
    ${where === '' ? '' : ` AND ${where}`};`,
	);

	const schemas = new Set(allTables.map((it) => it.table_schema));
	schemas.delete('public');

	const allSchemas = await db.query<{
		table_schema: string;
	}>(`select s.nspname as table_schema
  from pg_catalog.pg_namespace s
  join pg_catalog.pg_user u on u.usesysid = s.nspowner
  where nspname not in ('information_schema', 'pg_catalog', 'public')
        and nspname not like 'pg_toast%'
        and nspname not like 'pg_temp_%'
  order by table_schema;`);

	allSchemas.forEach((item) => {
		if (schemaFilters.includes(item.table_schema)) {
			schemas.add(item.table_schema);
		}
	});

	let columnsCount = 0;
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let tableCount = 0;
	let checksCount = 0;
	let viewsCount = 0;

	const sequencesToReturn: Record<string, Sequence> = {};

	const seqWhere = schemaFilters.map((t) => `schemaname = '${t}'`).join(' or ');

	const allSequences = await db.query(
		`select schemaname, sequencename, start_value, min_value, max_value, increment_by, cycle, cache_size from pg_sequences as seq${
			seqWhere === '' ? '' : ` WHERE ${seqWhere}`
		};`,
	);

	for (const dbSeq of allSequences) {
		const schemaName = dbSeq.schemaname;
		const sequenceName = dbSeq.sequencename;
		const startValue = stringFromDatabaseIdentityProperty(dbSeq.start_value);
		const minValue = stringFromDatabaseIdentityProperty(dbSeq.min_value);
		const maxValue = stringFromDatabaseIdentityProperty(dbSeq.max_value);
		const incrementBy = stringFromDatabaseIdentityProperty(dbSeq.increment_by);
		const cycle = dbSeq.cycle;
		const cacheSize = stringFromDatabaseIdentityProperty(dbSeq.cache_size);
		const key = `${schemaName}.${sequenceName}`;

		sequencesToReturn[key] = {
			name: sequenceName,
			schema: schemaName,
			startWith: startValue,
			minValue,
			maxValue,
			increment: incrementBy,
			cycle,
			cache: cacheSize,
		};
	}

	const whereEnums = schemaFilters.map((t) => `n.nspname = '${t}'`).join(' or ');

	const allEnums = await db.query(
		`select n.nspname as enum_schema,
  t.typname as enum_name,
  e.enumlabel as enum_value,
  e.enumsortorder as sort_order
  from pg_type t
  join pg_enum e on t.oid = e.enumtypid
  join pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  ${whereEnums === '' ? '' : ` WHERE ${whereEnums}`}
  order by enum_schema, enum_name, sort_order;`,
	);

	const enumsToReturn: Record<string, Enum> = {};

	for (const dbEnum of allEnums) {
		const enumName = dbEnum.enum_name;
		const enumValue = dbEnum.enum_value as string;
		const enumSchema: string = dbEnum.enum_schema || 'public';
		const key = `${enumSchema}.${enumName}`;

		if (enumsToReturn[key] !== undefined && enumsToReturn[key] !== null) {
			enumsToReturn[key].values.push(enumValue);
		} else {
			enumsToReturn[key] = {
				name: enumName,
				values: [enumValue],
				schema: enumSchema,
			};
		}
	}
	if (progressCallback) {
		progressCallback('enums', Object.keys(enumsToReturn).length, 'done');
	}

	const allRoles = await db.query<
		{ rolname: string; rolinherit: boolean; rolcreatedb: boolean; rolcreaterole: boolean }
	>(
		`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
	);

	const rolesToReturn: Record<string, Role> = {};

	const preparedRoles = prepareRoles(entities);

	if (
		preparedRoles.useRoles || !(preparedRoles.includeRoles.length === 0 && preparedRoles.excludeRoles.length === 0)
	) {
		for (const dbRole of allRoles) {
			if (
				preparedRoles.useRoles
			) {
				rolesToReturn[dbRole.rolname] = {
					createDb: dbRole.rolcreatedb,
					createRole: dbRole.rolcreatedb,
					inherit: dbRole.rolinherit,
					name: dbRole.rolname,
				};
			} else {
				if (preparedRoles.includeRoles.length === 0 && preparedRoles.excludeRoles.length === 0) continue;
				if (
					preparedRoles.includeRoles.includes(dbRole.rolname) && preparedRoles.excludeRoles.includes(dbRole.rolname)
				) continue;
				if (preparedRoles.excludeRoles.includes(dbRole.rolname)) continue;
				if (!preparedRoles.includeRoles.includes(dbRole.rolname)) continue;

				rolesToReturn[dbRole.rolname] = {
					createDb: dbRole.rolcreatedb,
					createRole: dbRole.rolcreaterole,
					inherit: dbRole.rolinherit,
					name: dbRole.rolname,
				};
			}
		}
	}

	const schemasForLinkedPoliciesInSchema = Object.values(tsSchema?.policies ?? {}).map((it) => it.schema!);

	const wherePolicies = [...schemaFilters, ...schemasForLinkedPoliciesInSchema]
		.map((t) => `schemaname = '${t}'`)
		.join(' or ');

	const policiesByTable: Record<string, Record<string, Policy>> = {};

	const allPolicies = await db.query<
		{
			schemaname: string;
			tablename: string;
			name: string;
			as: string;
			to: string;
			for: string;
			using: string;
			withCheck: string;
		}
	>(`SELECT schemaname, tablename, policyname as name, permissive as "as", roles as to, cmd as for, qual as using, with_check as "withCheck" FROM pg_policies${
		wherePolicies === '' ? '' : ` WHERE ${wherePolicies}`
	};`);

	for (const dbPolicy of allPolicies) {
		const { tablename, schemaname, to, withCheck, using, ...rest } = dbPolicy;
		const tableForPolicy = policiesByTable[`${schemaname}.${tablename}`];

		const parsedTo = typeof to === 'string' ? to.slice(1, -1).split(',') : to;

		const parsedWithCheck = withCheck === null ? undefined : withCheck;
		const parsedUsing = using === null ? undefined : using;

		if (tableForPolicy) {
			tableForPolicy[dbPolicy.name] = { ...rest, to: parsedTo } as Policy;
		} else {
			policiesByTable[`${schemaname}.${tablename}`] = {
				[dbPolicy.name]: { ...rest, to: parsedTo, withCheck: parsedWithCheck, using: parsedUsing } as Policy,
			};
		}

		if (tsSchema?.policies[dbPolicy.name]) {
			policies[dbPolicy.name] = {
				...rest,
				to: parsedTo,
				withCheck: parsedWithCheck,
				using: parsedUsing,
				on: tsSchema?.policies[dbPolicy.name].on,
			} as Policy;
		}
	}

	if (progressCallback) {
		progressCallback(
			'policies',
			Object.values(policiesByTable).reduce((total, innerRecord) => {
				return total + Object.keys(innerRecord).length;
			}, 0),
			'done',
		);
	}

	const sequencesInColumns: string[] = [];

	const all = allTables
		.filter((it) => it.type === 'table')
		.map((row) => {
			return new Promise(async (res, rej) => {
				const tableName = row.table_name as string;
				if (!tablesFilter(tableName)) return res('');
				tableCount += 1;
				const tableSchema = row.table_schema;

				try {
					const columnToReturn: Record<string, Column> = {};
					const indexToReturn: Record<string, Index> = {};
					const foreignKeysToReturn: Record<string, ForeignKey> = {};
					const primaryKeys: Record<string, PrimaryKey> = {};
					const uniqueConstrains: Record<string, UniqueConstraint> = {};
					const checkConstraints: Record<string, CheckConstraint> = {};

					const tableResponse = await getColumnsInfoQuery({ schema: tableSchema, table: tableName, db });

					const tableConstraints = await db.query(
						`SELECT c.column_name, c.data_type, constraint_type, constraint_name, constraint_schema
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)
      JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
      WHERE tc.table_name = '${tableName}' and constraint_schema = '${tableSchema}';`,
					);

					const tableChecks = await db.query(`SELECT 
						tc.constraint_name,
						tc.constraint_type,
						pg_get_constraintdef(con.oid) AS constraint_definition
					FROM 
						information_schema.table_constraints AS tc
						JOIN pg_constraint AS con 
							ON tc.constraint_name = con.conname
							AND con.conrelid = (
								SELECT oid 
								FROM pg_class 
								WHERE relname = tc.table_name 
								AND relnamespace = (
									SELECT oid 
									FROM pg_namespace 
									WHERE nspname = tc.constraint_schema
								)
							)
					WHERE 
						tc.table_name = '${tableName}'
						AND tc.constraint_schema = '${tableSchema}'
						AND tc.constraint_type = 'CHECK'
						AND con.contype = 'c';`);

					columnsCount += tableResponse.length;
					if (progressCallback) {
						progressCallback('columns', columnsCount, 'fetching');
					}

					const tableForeignKeys = await db.query(
						`SELECT
            con.contype AS constraint_type,
            nsp.nspname AS constraint_schema,
            con.conname AS constraint_name,
            rel.relname AS table_name,
            att.attname AS column_name,
            fnsp.nspname AS foreign_table_schema,
            frel.relname AS foreign_table_name,
            fatt.attname AS foreign_column_name,
            CASE con.confupdtype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'd' THEN 'SET DEFAULT'
            END AS update_rule,
            CASE con.confdeltype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'd' THEN 'SET DEFAULT'
            END AS delete_rule
          FROM
            pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = con.connamespace
            LEFT JOIN pg_catalog.pg_attribute att ON att.attnum = ANY (con.conkey)
              AND att.attrelid = con.conrelid
            LEFT JOIN pg_catalog.pg_class frel ON frel.oid = con.confrelid
            LEFT JOIN pg_catalog.pg_namespace fnsp ON fnsp.oid = frel.relnamespace
            LEFT JOIN pg_catalog.pg_attribute fatt ON fatt.attnum = ANY (con.confkey)
              AND fatt.attrelid = con.confrelid
          WHERE
            nsp.nspname = '${tableSchema}'
            AND rel.relname = '${tableName}'
            AND con.contype IN ('f');`,
					);

					foreignKeysCount += tableForeignKeys.length;
					if (progressCallback) {
						progressCallback('fks', foreignKeysCount, 'fetching');
					}
					for (const fk of tableForeignKeys) {
						// const tableFrom = fk.table_name;
						const columnFrom: string = fk.column_name;
						const tableTo = fk.foreign_table_name;
						const columnTo: string = fk.foreign_column_name;
						const schemaTo: string = fk.foreign_table_schema;
						const foreignKeyName = fk.constraint_name;
						const onUpdate = fk.update_rule?.toLowerCase();
						const onDelete = fk.delete_rule?.toLowerCase();

						if (typeof foreignKeysToReturn[foreignKeyName] !== 'undefined') {
							foreignKeysToReturn[foreignKeyName].columnsFrom.push(columnFrom);
							foreignKeysToReturn[foreignKeyName].columnsTo.push(columnTo);
						} else {
							foreignKeysToReturn[foreignKeyName] = {
								name: foreignKeyName,
								tableFrom: tableName,
								tableTo,
								schemaTo,
								columnsFrom: [columnFrom],
								columnsTo: [columnTo],
								onDelete,
								onUpdate,
							};
						}

						foreignKeysToReturn[foreignKeyName].columnsFrom = [
							...new Set(foreignKeysToReturn[foreignKeyName].columnsFrom),
						];

						foreignKeysToReturn[foreignKeyName].columnsTo = [...new Set(foreignKeysToReturn[foreignKeyName].columnsTo)];
					}

					const uniqueConstrainsRows = tableConstraints.filter((mapRow) => mapRow.constraint_type === 'UNIQUE');

					for (const unqs of uniqueConstrainsRows) {
						// const tableFrom = fk.table_name;
						const columnName: string = unqs.column_name;
						const constraintName: string = unqs.constraint_name;

						if (typeof uniqueConstrains[constraintName] !== 'undefined') {
							uniqueConstrains[constraintName].columns.push(columnName);
						} else {
							uniqueConstrains[constraintName] = {
								columns: [columnName],
								nullsNotDistinct: false,
								name: constraintName,
							};
						}
					}

					checksCount += tableChecks.length;
					if (progressCallback) {
						progressCallback('checks', checksCount, 'fetching');
					}
					for (const checks of tableChecks) {
						// CHECK (((email)::text <> 'test@gmail.com'::text))
						// Where (email) is column in table
						let checkValue: string = checks.constraint_definition;
						const constraintName: string = checks.constraint_name;

						checkValue = checkValue.replace(/^CHECK\s*\(\(/, '').replace(/\)\)\s*$/, '');

						checkConstraints[constraintName] = {
							name: constraintName,
							value: checkValue,
						};
					}

					for (const columnResponse of tableResponse) {
						const columnName = columnResponse.column_name;
						const columnAdditionalDT = columnResponse.additional_dt;
						const columnDimensions = columnResponse.array_dimensions;
						const enumType: string = columnResponse.enum_name;
						let columnType: string = columnResponse.data_type;
						const typeSchema = columnResponse.type_schema;
						const defaultValueRes: string = columnResponse.column_default;

						const isGenerated = columnResponse.is_generated === 'ALWAYS';
						const generationExpression = columnResponse.generation_expression;
						const isIdentity = columnResponse.is_identity === 'YES';
						const identityGeneration = columnResponse.identity_generation === 'ALWAYS' ? 'always' : 'byDefault';
						const identityStart = columnResponse.identity_start;
						const identityIncrement = columnResponse.identity_increment;
						const identityMaximum = columnResponse.identity_maximum;
						const identityMinimum = columnResponse.identity_minimum;
						const identityCycle = columnResponse.identity_cycle === 'YES';
						const identityName = columnResponse.seq_name;

						const primaryKey = tableConstraints.filter((mapRow) =>
							columnName === mapRow.column_name && mapRow.constraint_type === 'PRIMARY KEY'
						);

						const cprimaryKey = tableConstraints.filter((mapRow) => mapRow.constraint_type === 'PRIMARY KEY');

						if (cprimaryKey.length > 1) {
							const tableCompositePkName = await db.query(
								`SELECT conname AS primary_key
            FROM   pg_constraint join pg_class on (pg_class.oid = conrelid)
            WHERE  contype = 'p' 
            AND    connamespace = $1::regnamespace  
            AND    pg_class.relname = $2;`,
								[tableSchema, tableName],
							);
							primaryKeys[tableCompositePkName[0].primary_key] = {
								name: tableCompositePkName[0].primary_key,
								columns: cprimaryKey.map((c: any) => c.column_name),
							};
						}

						let columnTypeMapped = columnType;

						// Set default to internal object
						if (columnAdditionalDT === 'ARRAY') {
							if (typeof internals.tables[tableName] === 'undefined') {
								internals.tables[tableName] = {
									columns: {
										[columnName]: {
											isArray: true,
											dimensions: columnDimensions,
											rawType: columnTypeMapped.substring(0, columnTypeMapped.length - 2),
										},
									},
								};
							} else {
								if (typeof internals.tables[tableName]!.columns[columnName] === 'undefined') {
									internals.tables[tableName]!.columns[columnName] = {
										isArray: true,
										dimensions: columnDimensions,
										rawType: columnTypeMapped.substring(0, columnTypeMapped.length - 2),
									};
								}
							}
						}

						const defaultValue = defaultForColumn(columnResponse, internals, tableName);
						if (
							defaultValue === 'NULL'
							|| (defaultValueRes && defaultValueRes.startsWith('(') && defaultValueRes.endsWith(')'))
						) {
							if (typeof internals!.tables![tableName] === 'undefined') {
								internals!.tables![tableName] = {
									columns: {
										[columnName]: {
											isDefaultAnExpression: true,
										},
									},
								};
							} else {
								if (typeof internals!.tables![tableName]!.columns[columnName] === 'undefined') {
									internals!.tables![tableName]!.columns[columnName] = {
										isDefaultAnExpression: true,
									};
								} else {
									internals!.tables![tableName]!.columns[columnName]!.isDefaultAnExpression = true;
								}
							}
						}

						const isSerial = columnType === 'serial';

						if (columnTypeMapped.startsWith('numeric(')) {
							columnTypeMapped = columnTypeMapped.replace(',', ', ');
						}

						if (columnAdditionalDT === 'ARRAY') {
							for (let i = 1; i < Number(columnDimensions); i++) {
								columnTypeMapped += '[]';
							}
						}

						columnTypeMapped = columnTypeMapped
							.replace('character varying', 'varchar')
							.replace(' without time zone', '')
							// .replace("timestamp without time zone", "timestamp")
							.replace('character', 'char');

						columnTypeMapped = trimChar(columnTypeMapped, '"');

						columnToReturn[columnName] = {
							name: columnName,
							type:
								// filter vectors, but in future we should filter any extension that was installed by user
								columnAdditionalDT === 'USER-DEFINED'
									&& !['vector', 'geometry', 'halfvec', 'sparsevec', 'bit'].includes(enumType)
									? enumType
									: columnTypeMapped,
							typeSchema: enumsToReturn[`${typeSchema}.${enumType}`] !== undefined
								? enumsToReturn[`${typeSchema}.${enumType}`].schema
								: undefined,
							primaryKey: primaryKey.length === 1 && cprimaryKey.length < 2,
							// default: isSerial ? undefined : defaultValue,
							notNull: columnResponse.is_nullable === 'NO',
							generated: isGenerated
								? { as: generationExpression, type: 'stored' }
								: undefined,
							identity: isIdentity
								? {
									type: identityGeneration,
									name: identityName,
									increment: stringFromDatabaseIdentityProperty(identityIncrement),
									minValue: stringFromDatabaseIdentityProperty(identityMinimum),
									maxValue: stringFromDatabaseIdentityProperty(identityMaximum),
									startWith: stringFromDatabaseIdentityProperty(identityStart),
									cache: sequencesToReturn[identityName]?.cache
										? sequencesToReturn[identityName]?.cache
										: sequencesToReturn[`${tableSchema}.${identityName}`]?.cache
										? sequencesToReturn[`${tableSchema}.${identityName}`]?.cache
										: undefined,
									cycle: identityCycle,
									schema: tableSchema,
								}
								: undefined,
						};

						if (identityName && typeof identityName === 'string') {
							// remove "" from sequence name
							delete sequencesToReturn[
								`${tableSchema}.${
									identityName.startsWith('"') && identityName.endsWith('"') ? identityName.slice(1, -1) : identityName
								}`
							];
							delete sequencesToReturn[identityName];
						}

						if (!isSerial && typeof defaultValue !== 'undefined') {
							columnToReturn[columnName].default = defaultValue;
						}
					}

					const dbIndexes = await db.query(
						`SELECT  DISTINCT ON (t.relname, ic.relname, k.i) t.relname as table_name, ic.relname AS indexname,
        k.i AS index_order,
        i.indisunique as is_unique,
        am.amname as method,
        ic.reloptions as with,
        coalesce(a.attname, pg_get_indexdef(i.indexrelid, k.i, false)) AS column_name,
          CASE
        WHEN pg_get_expr(i.indexprs, i.indrelid) IS NOT NULL THEN 1
        ELSE 0
    END AS is_expression,
        i.indoption[k.i-1] & 1 = 1 AS descending,
        i.indoption[k.i-1] & 2 = 2 AS nulls_first,
        pg_get_expr(
                              i.indpred,
                              i.indrelid
                          ) as where,
         opc.opcname
      FROM pg_class t
          LEFT JOIN pg_index i ON t.oid = i.indrelid
          LEFT JOIN pg_class ic ON ic.oid = i.indexrelid
		  CROSS JOIN LATERAL (SELECT unnest(i.indkey), generate_subscripts(i.indkey, 1) + 1) AS k(attnum, i)
          LEFT JOIN pg_attribute AS a
            ON i.indrelid = a.attrelid AND k.attnum = a.attnum
          JOIN pg_namespace c on c.oid = t.relnamespace
        LEFT JOIN pg_am AS am ON ic.relam = am.oid
        JOIN pg_opclass opc ON opc.oid = ANY(i.indclass)
      WHERE
      c.nspname = '${tableSchema}' AND
      t.relname = '${tableName}';`,
					);

					const dbIndexFromConstraint = await db.query(
						`SELECT
          idx.indexrelname AS index_name,
          idx.relname AS table_name,
          schemaname,
          CASE WHEN con.conname IS NOT NULL THEN 1 ELSE 0 END AS generated_by_constraint
        FROM
          pg_stat_user_indexes idx
        LEFT JOIN
          pg_constraint con ON con.conindid = idx.indexrelid
        WHERE idx.relname = '${tableName}' and schemaname = '${tableSchema}'
        group by index_name, table_name,schemaname, generated_by_constraint;`,
					);

					const idxsInConsteraint = dbIndexFromConstraint.filter((it) => it.generated_by_constraint === 1).map((it) =>
						it.index_name
					);

					for (const dbIndex of dbIndexes) {
						const indexName: string = dbIndex.indexname;
						const indexColumnName: string = dbIndex.column_name;
						const indexIsUnique = dbIndex.is_unique;
						const indexMethod = dbIndex.method;
						const indexWith: string[] = dbIndex.with;
						const indexWhere: string = dbIndex.where;
						const opclass: string = dbIndex.opcname;
						const isExpression = dbIndex.is_expression === 1;

						const desc: boolean = dbIndex.descending;
						const nullsFirst: boolean = dbIndex.nulls_first;

						const mappedWith: Record<string, string> = {};

						if (indexWith !== null) {
							indexWith
								// .slice(1, indexWith.length - 1)
								// .split(",")
								.forEach((it) => {
									const splitted = it.split('=');
									mappedWith[splitted[0]] = splitted[1];
								});
						}

						if (idxsInConsteraint.includes(indexName)) continue;

						if (typeof indexToReturn[indexName] !== 'undefined') {
							indexToReturn[indexName].columns.push({
								expression: indexColumnName,
								asc: !desc,
								nulls: nullsFirst ? 'first' : 'last',
								opclass,
								isExpression,
							});
						} else {
							indexToReturn[indexName] = {
								name: indexName,
								columns: [
									{
										expression: indexColumnName,
										asc: !desc,
										nulls: nullsFirst ? 'first' : 'last',
										opclass,
										isExpression,
									},
								],
								isUnique: indexIsUnique,
								// should not be a part of diff detects
								concurrently: false,
								method: indexMethod,
								where: indexWhere === null ? undefined : indexWhere,
								with: mappedWith,
							};
						}
					}

					indexesCount += Object.keys(indexToReturn).length;
					if (progressCallback) {
						progressCallback('indexes', indexesCount, 'fetching');
					}
					result[`${tableSchema}.${tableName}`] = {
						name: tableName,
						schema: tableSchema !== 'public' ? tableSchema : '',
						columns: columnToReturn,
						indexes: indexToReturn,
						foreignKeys: foreignKeysToReturn,
						compositePrimaryKeys: primaryKeys,
						uniqueConstraints: uniqueConstrains,
						checkConstraints: checkConstraints,
						policies: policiesByTable[`${tableSchema}.${tableName}`] ?? {},
						isRLSEnabled: row.rls_enabled,
					};
				} catch (e) {
					rej(e);
					return;
				}
				res('');
			});
		});

	if (progressCallback) {
		progressCallback('tables', tableCount, 'done');
	}

	for await (const _ of all) {
	}

	const allViews = allTables
		.filter((it) => it.type === 'view' || it.type === 'materialized_view')
		.map((row) => {
			return new Promise(async (res, rej) => {
				const viewName = row.table_name as string;
				if (!tablesFilter(viewName)) return res('');
				tableCount += 1;
				const viewSchema = row.table_schema;

				try {
					const columnToReturn: Record<string, Column> = {};

					const viewResponses = await getColumnsInfoQuery({ schema: viewSchema, table: viewName, db });

					for (const viewResponse of viewResponses) {
						const columnName = viewResponse.column_name;
						const columnAdditionalDT = viewResponse.additional_dt;
						const columnDimensions = viewResponse.array_dimensions;
						const enumType: string = viewResponse.enum_name;
						let columnType: string = viewResponse.data_type;
						const typeSchema = viewResponse.type_schema;
						// const defaultValueRes: string = viewResponse.column_default;

						const isGenerated = viewResponse.is_generated === 'ALWAYS';
						const generationExpression = viewResponse.generation_expression;
						const isIdentity = viewResponse.is_identity === 'YES';
						const identityGeneration = viewResponse.identity_generation === 'ALWAYS' ? 'always' : 'byDefault';
						const identityStart = viewResponse.identity_start;
						const identityIncrement = viewResponse.identity_increment;
						const identityMaximum = viewResponse.identity_maximum;
						const identityMinimum = viewResponse.identity_minimum;
						const identityCycle = viewResponse.identity_cycle === 'YES';
						const identityName = viewResponse.seq_name;
						const defaultValueRes = viewResponse.column_default;

						const primaryKey = viewResponse.constraint_type === 'PRIMARY KEY';

						let columnTypeMapped = columnType;

						// Set default to internal object
						if (columnAdditionalDT === 'ARRAY') {
							if (typeof internals.tables[viewName] === 'undefined') {
								internals.tables[viewName] = {
									columns: {
										[columnName]: {
											isArray: true,
											dimensions: columnDimensions,
											rawType: columnTypeMapped.substring(0, columnTypeMapped.length - 2),
										},
									},
								};
							} else {
								if (typeof internals.tables[viewName]!.columns[columnName] === 'undefined') {
									internals.tables[viewName]!.columns[columnName] = {
										isArray: true,
										dimensions: columnDimensions,
										rawType: columnTypeMapped.substring(0, columnTypeMapped.length - 2),
									};
								}
							}
						}

						const defaultValue = defaultForColumn(viewResponse, internals, viewName);
						if (
							defaultValue === 'NULL'
							|| (defaultValueRes && defaultValueRes.startsWith('(') && defaultValueRes.endsWith(')'))
						) {
							if (typeof internals!.tables![viewName] === 'undefined') {
								internals!.tables![viewName] = {
									columns: {
										[columnName]: {
											isDefaultAnExpression: true,
										},
									},
								};
							} else {
								if (typeof internals!.tables![viewName]!.columns[columnName] === 'undefined') {
									internals!.tables![viewName]!.columns[columnName] = {
										isDefaultAnExpression: true,
									};
								} else {
									internals!.tables![viewName]!.columns[columnName]!.isDefaultAnExpression = true;
								}
							}
						}

						const isSerial = columnType === 'serial';

						if (columnTypeMapped.startsWith('numeric(')) {
							columnTypeMapped = columnTypeMapped.replace(',', ', ');
						}

						if (columnAdditionalDT === 'ARRAY') {
							for (let i = 1; i < Number(columnDimensions); i++) {
								columnTypeMapped += '[]';
							}
						}

						columnTypeMapped = columnTypeMapped
							.replace('character varying', 'varchar')
							.replace(' without time zone', '')
							// .replace("timestamp without time zone", "timestamp")
							.replace('character', 'char');

						columnTypeMapped = trimChar(columnTypeMapped, '"');

						columnToReturn[columnName] = {
							name: columnName,
							type:
								// filter vectors, but in future we should filter any extension that was installed by user
								columnAdditionalDT === 'USER-DEFINED'
									&& !['vector', 'geometry', 'halfvec', 'sparsevec', 'bit'].includes(enumType)
									? enumType
									: columnTypeMapped,
							typeSchema: enumsToReturn[`${typeSchema}.${enumType}`] !== undefined
								? enumsToReturn[`${typeSchema}.${enumType}`].schema
								: undefined,
							primaryKey: primaryKey,
							notNull: viewResponse.is_nullable === 'NO',
							generated: isGenerated ? { as: generationExpression, type: 'stored' } : undefined,
							identity: isIdentity
								? {
									type: identityGeneration,
									name: identityName,
									increment: stringFromDatabaseIdentityProperty(identityIncrement),
									minValue: stringFromDatabaseIdentityProperty(identityMinimum),
									maxValue: stringFromDatabaseIdentityProperty(identityMaximum),
									startWith: stringFromDatabaseIdentityProperty(identityStart),
									cache: sequencesToReturn[identityName]?.cache
										? sequencesToReturn[identityName]?.cache
										: sequencesToReturn[`${viewSchema}.${identityName}`]?.cache
										? sequencesToReturn[`${viewSchema}.${identityName}`]?.cache
										: undefined,
									cycle: identityCycle,
									schema: viewSchema,
								}
								: undefined,
						};

						if (identityName) {
							// remove "" from sequence name
							delete sequencesToReturn[
								`${viewSchema}.${
									identityName.startsWith('"') && identityName.endsWith('"') ? identityName.slice(1, -1) : identityName
								}`
							];
							delete sequencesToReturn[identityName];
						}

						if (!isSerial && typeof defaultValue !== 'undefined') {
							columnToReturn[columnName].default = defaultValue;
						}
					}

					const [viewInfo] = await db.query<{
						view_name: string;
						schema_name: string;
						definition: string;
						tablespace_name: string | null;
						options: string[] | null;
						location: string | null;
					}>(`
					SELECT
    c.relname AS view_name,
    n.nspname AS schema_name,
    pg_get_viewdef(c.oid, true) AS definition,
    ts.spcname AS tablespace_name,
    c.reloptions AS options,
    pg_tablespace_location(ts.oid) AS location
FROM
    pg_class c
JOIN
    pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN
    pg_tablespace ts ON c.reltablespace = ts.oid 
WHERE
    (c.relkind = 'm' OR c.relkind = 'v')
    AND n.nspname = '${viewSchema}'
    AND c.relname = '${viewName}';`);

					const resultWith: { [key: string]: string | boolean | number } = {};
					if (viewInfo.options) {
						viewInfo.options.forEach((pair) => {
							const splitted = pair.split('=');
							const key = splitted[0];
							const value = splitted[1];

							if (value === 'true') {
								resultWith[key] = true;
							} else if (value === 'false') {
								resultWith[key] = false;
							} else if (!isNaN(Number(value))) {
								resultWith[key] = Number(value);
							} else {
								resultWith[key] = value;
							}
						});
					}

					const definition = viewInfo.definition.replace(/\s+/g, ' ').replace(';', '').trim();
					// { "check_option":"cascaded","security_barrier":true} -> // { "checkOption":"cascaded","securityBarrier":true}
					const withOption = Object.values(resultWith).length
						? Object.fromEntries(Object.entries(resultWith).map(([key, value]) => [key.camelCase(), value]))
						: undefined;

					const materialized = row.type === 'materialized_view';

					views[`${viewSchema}.${viewName}`] = {
						name: viewName,
						schema: viewSchema,
						columns: columnToReturn,
						isExisting: false,
						definition: definition,
						materialized: materialized,
						with: withOption,
						tablespace: viewInfo.tablespace_name ?? undefined,
					};
				} catch (e) {
					rej(e);
					return;
				}
				res('');
			});
		});

	viewsCount = allViews.length;

	for await (const _ of allViews) {
	}

	if (progressCallback) {
		progressCallback('columns', columnsCount, 'done');
		progressCallback('indexes', indexesCount, 'done');
		progressCallback('fks', foreignKeysCount, 'done');
		progressCallback('checks', checksCount, 'done');
		progressCallback('views', viewsCount, 'done');
	}

	const schemasObject = Object.fromEntries([...schemas].map((it) => [it, it]));

	return {
		version: '7',
		dialect: 'postgresql',
		tables: result,
		enums: enumsToReturn,
		schemas: schemasObject,
		sequences: sequencesToReturn,
		roles: rolesToReturn,
		policies,
		views: views,
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
		internal: internals,
	};
};

const defaultForColumn = (column: any, internals: PgKitInternals, tableName: string) => {
	const columnName = column.column_name;
	const isArray = internals?.tables[tableName]?.columns[columnName]?.isArray ?? false;

	if (
		column.column_default === null
		|| column.column_default === undefined
		|| column.data_type === 'serial'
		|| column.data_type === 'smallserial'
		|| column.data_type === 'bigserial'
	) {
		return undefined;
	}

	if (column.column_default.endsWith('[]')) {
		column.column_default = column.column_default.slice(0, -2);
	}

	// if (
	// 	!['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(column.data_type)
	// ) {
	column.column_default = column.column_default.replace(/::(.*?)(?<![^\w"])(?=$)/, '');
	// }

	const columnDefaultAsString: string = column.column_default.toString();

	if (isArray) {
		return `'{${
			columnDefaultAsString
				.slice(2, -2)
				.split(/\s*,\s*/g)
				.map((value) => {
					if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(column.data_type.slice(0, -2))) {
						return value;
					} else if (column.data_type.startsWith('timestamp')) {
						return `${value}`;
					} else if (column.data_type.slice(0, -2) === 'interval') {
						return value.replaceAll('"', `\"`);
					} else if (column.data_type.slice(0, -2) === 'boolean') {
						return value === 't' ? 'true' : 'false';
					} else if (['json', 'jsonb'].includes(column.data_type.slice(0, -2))) {
						return JSON.stringify(JSON.stringify(JSON.parse(JSON.parse(value)), null, 0));
					} else {
						return `\"${value}\"`;
					}
				})
				.join(',')
		}}'`;
	}

	if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(column.data_type)) {
		if (/^-?[\d.]+(?:e-?\d+)?$/.test(columnDefaultAsString)) {
			return Number(columnDefaultAsString);
		} else {
			if (typeof internals!.tables![tableName] === 'undefined') {
				internals!.tables![tableName] = {
					columns: {
						[columnName]: {
							isDefaultAnExpression: true,
						},
					},
				};
			} else {
				if (typeof internals!.tables![tableName]!.columns[columnName] === 'undefined') {
					internals!.tables![tableName]!.columns[columnName] = {
						isDefaultAnExpression: true,
					};
				} else {
					internals!.tables![tableName]!.columns[columnName]!.isDefaultAnExpression = true;
				}
			}
			return columnDefaultAsString;
		}
	} else if (column.data_type.includes('numeric')) {
		// if numeric(1,1) and used '99' -> psql stores like '99'::numeric
		return columnDefaultAsString.includes("'") ? columnDefaultAsString : `'${columnDefaultAsString}'`;
	} else if (column.data_type === 'json' || column.data_type === 'jsonb') {
		const jsonWithoutSpaces = JSON.stringify(JSON.parse(columnDefaultAsString.slice(1, -1)));
		return `'${jsonWithoutSpaces}'::${column.data_type}`;
	} else if (column.data_type === 'boolean') {
		return column.column_default === 'true';
	} else if (columnDefaultAsString === 'NULL') {
		return `NULL`;
	} else if (columnDefaultAsString.startsWith("'") && columnDefaultAsString.endsWith("'")) {
		return columnDefaultAsString;
	} else {
		return `${columnDefaultAsString.replace(/\\/g, '`\\')}`;
	}
};

const getColumnsInfoQuery = ({ schema, table, db }: { schema: string; table: string; db: DB }) => {
	return db.query(
		`SELECT 
    a.attrelid::regclass::text AS table_name,  -- Table, view, or materialized view name
    a.attname AS column_name,   -- Column name
    CASE 
        WHEN NOT a.attisdropped THEN 
            CASE 
                WHEN a.attnotnull THEN 'NO'
                ELSE 'YES'
            END 
        ELSE NULL 
    END AS is_nullable,  -- NULL or NOT NULL constraint
    a.attndims AS array_dimensions,  -- Array dimensions
    CASE 
        WHEN a.atttypid = ANY ('{int,int8,int2}'::regtype[]) 
        AND EXISTS (
            SELECT FROM pg_attrdef ad
            WHERE ad.adrelid = a.attrelid 
            AND ad.adnum = a.attnum 
            AND pg_get_expr(ad.adbin, ad.adrelid) = 'nextval(''' 
                || pg_get_serial_sequence(a.attrelid::regclass::text, a.attname)::regclass || '''::regclass)'
        )
        THEN CASE a.atttypid
            WHEN 'int'::regtype THEN 'serial'
            WHEN 'int8'::regtype THEN 'bigserial'
            WHEN 'int2'::regtype THEN 'smallserial'
        END
        ELSE format_type(a.atttypid, a.atttypmod)
    END AS data_type,  -- Column data type
--    ns.nspname AS type_schema,  -- Schema name
    pg_get_serial_sequence('"${schema}"."${table}"', a.attname)::regclass AS seq_name,  -- Serial sequence (if any)
    c.column_default,  -- Column default value
    c.data_type AS additional_dt,  -- Data type from information_schema
    c.udt_name AS enum_name,  -- Enum type (if applicable)
    c.is_generated,  -- Is it a generated column?
    c.generation_expression,  -- Generation expression (if generated)
    c.is_identity,  -- Is it an identity column?
    c.identity_generation,  -- Identity generation strategy (ALWAYS or BY DEFAULT)
    c.identity_start,  -- Start value of identity column
    c.identity_increment,  -- Increment for identity column
    c.identity_maximum,  -- Maximum value for identity column
    c.identity_minimum,  -- Minimum value for identity column
    c.identity_cycle,  -- Does the identity column cycle?
    enum_ns.nspname AS type_schema  -- Schema of the enum type
FROM 
    pg_attribute a
JOIN 
    pg_class cls ON cls.oid = a.attrelid  -- Join pg_class to get table/view/materialized view info
JOIN 
    pg_namespace ns ON ns.oid = cls.relnamespace  -- Join namespace to get schema info
LEFT JOIN 
    information_schema.columns c ON c.column_name = a.attname 
        AND c.table_schema = ns.nspname 
        AND c.table_name = cls.relname  -- Match schema and table/view name
LEFT JOIN 
    pg_type enum_t ON enum_t.oid = a.atttypid  -- Join to get the type info
LEFT JOIN 
    pg_namespace enum_ns ON enum_ns.oid = enum_t.typnamespace  -- Join to get the enum schema
WHERE 
    a.attnum > 0  -- Valid column numbers only
    AND NOT a.attisdropped  -- Skip dropped columns
    AND cls.relkind IN ('r', 'v', 'm')  -- Include regular tables ('r'), views ('v'), and materialized views ('m')
    AND ns.nspname = '${schema}'  -- Filter by schema
    AND cls.relname = '${table}'  -- Filter by table name
ORDER BY 
    a.attnum;  -- Order by column number`,
	);
};
