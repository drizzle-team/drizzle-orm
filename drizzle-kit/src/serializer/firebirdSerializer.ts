import chalk from 'chalk';
import { getTableName, is, SQL } from 'drizzle-orm';
import {
	AnyFirebirdTable,
	FirebirdColumn,
	FirebirdSyncDialect,
	FirebirdView,
	getTableConfig,
	getViewConfig,
	uniqueKeyName,
} from 'drizzle-orm/firebird-core';
import { CasingType } from 'src/cli/validations/common';
import { withStyle } from '../cli/validations/outputs';
import type { IntrospectStage, IntrospectStatus } from '../cli/views';
import type {
	CheckConstraint,
	Column,
	FirebirdKitInternals,
	FirebirdSchemaInternal,
	ForeignKey,
	Identity,
	Index,
	PrimaryKey,
	Table,
	UniqueConstraint,
	View,
} from '../serializer/firebirdSchema';
import { escapeSingleQuotes, type DB } from '../utils';
import { getColumnCasing, sqlToStr } from './utils';

const stringFromIdentityProperty = (value: unknown) => {
	return value === undefined ? undefined : String(value);
};

const prepareIdentity = (
	tableName: string,
	columnName: string,
	identity: FirebirdColumn['generatedIdentity'],
): Identity | undefined => {
	if (!identity) return undefined;
	return {
		type: identity.type,
		name: identity.sequenceName ?? `${tableName}_${columnName}_seq`,
		increment: stringFromIdentityProperty(identity.sequenceOptions?.increment),
		minValue: stringFromIdentityProperty(identity.sequenceOptions?.minValue),
		maxValue: stringFromIdentityProperty(identity.sequenceOptions?.maxValue),
		startWith: stringFromIdentityProperty(identity.sequenceOptions?.startWith),
		cache: stringFromIdentityProperty(identity.sequenceOptions?.cache),
		cycle: identity.sequenceOptions?.cycle ?? false,
	};
};

export const generateFirebirdSnapshot = (
	tables: AnyFirebirdTable[],
	views: FirebirdView[],
	casing: CasingType | undefined,
): FirebirdSchemaInternal => {
	const dialect = new FirebirdSyncDialect({ casing });
	const result: Record<string, Table> = {};
	const resultViews: Record<string, View> = {};

	const internal: FirebirdKitInternals = { indexes: {} };
	for (const table of tables) {
		const columnsObject: Record<string, Column> = {};
		const indexesObject: Record<string, Index> = {};
		const foreignKeysObject: Record<string, ForeignKey> = {};
		const primaryKeysObject: Record<string, PrimaryKey> = {};
		const uniqueConstraintObject: Record<string, UniqueConstraint> = {};
		const checkConstraintObject: Record<string, CheckConstraint> = {};

		const checksInTable: Record<string, string[]> = {};

		const {
			name: tableName,
			columns,
			indexes,
			checks,
			foreignKeys: tableForeignKeys,
			primaryKeys,
			uniqueConstraints,
		} = getTableConfig(table);

		columns.forEach((column) => {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const primaryKey: boolean = column.primary;
			const generated = column.generated;
			const identity = prepareIdentity(tableName, name, column.generatedIdentity);

			const columnToSet: Column = {
				name,
				type: column.getSQLType(),
				primaryKey,
				notNull,
				autoincrement: !!identity,
				identity,
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
					columnToSet.default = sqlToStr(column.default, casing);
				} else {
					columnToSet.default = typeof column.default === 'string'
						? `'${escapeSingleQuotes(column.default)}'`
						: typeof column.default === 'object'
								|| Array.isArray(column.default)
						? `'${JSON.stringify(column.default)}'`
						: column.default;
				}
			}
			columnsObject[name] = columnToSet;

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
				indexesObject[column.uniqueName!] = {
					name: column.uniqueName!,
					columns: [columnToSet.name],
					isUnique: true,
				};
			}
		});

		const foreignKeys: ForeignKey[] = tableForeignKeys.map((fk) => {
			const tableFrom = tableName;
			const onDelete = fk.onDelete ?? 'no action';
			const onUpdate = fk.onUpdate ?? 'no action';
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;
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

		foreignKeys.forEach((it) => {
			foreignKeysObject[it.name] = it;
		});

		indexes.forEach((value) => {
			const columns = value.config.columns;
			const name = value.config.name;

			const indexColumns = columns.map((it) => {
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
					} else if (typeof internal!.indexes![name]?.columns[sql] === 'undefined') {
						internal!.indexes![name]!.columns[sql] = {
							isExpression: true,
						};
					} else {
						internal!.indexes![name]!.columns[sql]!.isExpression = true;
					}
					return sql;
				} else {
					return getColumnCasing(it, casing);
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
			const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));

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
				const originalColumnNames = it.columns.map((c) => c.name);
				const columnNames = it.columns.map((c) => getColumnCasing(c, casing));

				let name = it.getName();
				if (casing !== undefined) {
					for (let i = 0; i < originalColumnNames.length; i++) {
						name = name.replace(originalColumnNames[i], columnNames[i]);
					}
				}

				primaryKeysObject[name] = {
					columns: columnNames,
					name,
				};
			} else {
				columnsObject[getColumnCasing(it.columns[0], casing)].primaryKey = true;
			}
		});

		checks.forEach((check) => {
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

		result[tableName] = {
			name: tableName,
			columns: columnsObject,
			indexes: indexesObject,
			foreignKeys: foreignKeysObject,
			compositePrimaryKeys: primaryKeysObject,
			uniqueConstraints: uniqueConstraintObject,
			checkConstraints: checkConstraintObject,
		};
	}

	for (const view of views) {
		const { name, isExisting, selectedFields, query } = getViewConfig(view);

		const columnsObject: Record<string, Column> = {};

		const existingView = resultViews[name];
		if (typeof existingView !== 'undefined') {
			console.log(
				`\n${
					withStyle.errorWarning(
						`We\'ve found duplicated view name. Please rename your view`,
					)
				}`,
			);
			process.exit(1);
		}

		for (const key in selectedFields) {
			if (is(selectedFields[key], FirebirdColumn)) {
				const column = selectedFields[key];
				const notNull: boolean = column.notNull;
				const primaryKey: boolean = column.primary;
				const generated = column.generated;
				const identity = prepareIdentity(name, column.name, column.generatedIdentity);

				const columnToSet: Column = {
					name: column.name,
					type: column.getSQLType(),
					primaryKey,
					notNull,
					autoincrement: !!identity,
					identity,
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
						columnToSet.default = sqlToStr(column.default, casing);
					} else {
						columnToSet.default = typeof column.default === 'string'
							? `'${escapeSingleQuotes(column.default)}'`
							: typeof column.default === 'object'
									|| Array.isArray(column.default)
							? `'${JSON.stringify(column.default)}'`
							: column.default;
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
		};
	}

	return {
		version: '6',
		dialect: 'firebird',
		tables: result,
		views: resultViews,
		enums: {},
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};

const trimFirebirdIdentifier = (value: unknown): string => {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
};

const sourceToString = (value: unknown): string | undefined => {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'function') return undefined;
	if (typeof value === 'string') return value.trim();
	return String(value).trim();
};

const defaultSourceToSnapshotValue = (value: unknown): Column['default'] | undefined => {
	const raw = sourceToString(value);
	if (!raw) return undefined;

	const defaultValue = raw.replace(/^default\s+/i, '').trim();
	if (!defaultValue) return undefined;

	const upper = defaultValue.toUpperCase();
	if (upper === 'TRUE') return true;
	if (upper === 'FALSE') return false;
	if (upper === 'NULL') return 'NULL';

	if (/^-?\d+(\.\d+)?$/.test(defaultValue)) {
		return Number(defaultValue);
	}

	if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
		return defaultValue;
	}

	if (['CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP'].includes(upper)) {
		return upper.toLowerCase();
	}

	return `(${defaultValue})`;
};

const checkSourceToSnapshotValue = (value: unknown): string | undefined => {
	const raw = sourceToString(value);
	if (!raw) return undefined;

	const source = raw.replace(/;\s*$/, '').trim();
	const match = source.match(/^check\s*\(([\s\S]*)\)$/i);
	if (match) {
		return match[1].trim();
	}

	return source.replace(/^check\s*/i, '').trim();
};

const numberOrUndefined = (value: unknown): number | undefined => {
	if (value === null || value === undefined) return undefined;
	const asNumber = Number(value);
	return Number.isFinite(asNumber) ? asNumber : undefined;
};

const mapFirebirdNumericType = (
	precision: number | undefined,
	scale: number | undefined,
	fallbackPrecision = 18,
): string => {
	const actualScale = Math.abs(scale ?? 0);
	const actualPrecision = precision ?? fallbackPrecision;

	if (actualPrecision !== undefined && actualScale !== undefined) {
		return `numeric(${actualPrecision}, ${actualScale})`;
	}

	if (actualPrecision !== undefined) {
		return `numeric(${actualPrecision})`;
	}

	return 'numeric';
};

const mapFirebirdColumnType = (column: {
	fieldType: unknown;
	fieldSubType: unknown;
	fieldScale: unknown;
	fieldPrecision: unknown;
	characterLength: unknown;
}): string => {
	const fieldType = Number(column.fieldType);
	const fieldSubType = numberOrUndefined(column.fieldSubType) ?? 0;
	const fieldScale = numberOrUndefined(column.fieldScale) ?? 0;
	const fieldPrecision = numberOrUndefined(column.fieldPrecision);
	const characterLength = numberOrUndefined(column.characterLength);

	switch (fieldType) {
		case 7:
			return fieldSubType === 0 && fieldScale === 0
				? 'smallint'
				: mapFirebirdNumericType(fieldPrecision, fieldScale, 4);
		case 8:
			return fieldSubType === 0 && fieldScale === 0
				? 'integer'
				: mapFirebirdNumericType(fieldPrecision, fieldScale, 9);
		case 10:
			return 'real';
		case 11:
		case 27:
			return 'double precision';
		case 12:
			return 'date';
		case 13:
			return 'time';
		case 14:
			return characterLength === undefined ? 'char' : `char(${characterLength})`;
		case 16:
			return fieldSubType === 0 && fieldScale === 0
				? 'bigint'
				: mapFirebirdNumericType(fieldPrecision, fieldScale, 18);
		case 23:
			return 'boolean';
		case 24:
			return 'numeric(16)';
		case 25:
			return 'numeric(34)';
		case 26:
			return fieldSubType === 0 && fieldScale === 0
				? 'numeric(38, 0)'
				: mapFirebirdNumericType(fieldPrecision, fieldScale, 38);
		case 28:
			return 'time with time zone';
		case 29:
			return 'timestamp with time zone';
		case 35:
			return 'timestamp';
		case 37:
			return characterLength === undefined ? 'varchar' : `varchar(${characterLength})`;
		case 261:
			return 'blob';
		default:
			return 'blob';
	}
};

const groupConstraintColumns = <T extends {
	tableName: string;
	constraintName: string;
	columnName: string;
	position: number;
}>(rows: T[]) => {
	return rows.reduce<Record<string, { tableName: string; constraintName: string; columns: string[] }>>((acc, row) => {
		const key = `${row.tableName}.${row.constraintName}`;
		acc[key] ??= {
			tableName: row.tableName,
			constraintName: row.constraintName,
			columns: [],
		};
		acc[key].columns[row.position] = row.columnName;
		return acc;
	}, {});
};

const toAction = (value: unknown): string | undefined => {
	const action = trimFirebirdIdentifier(value).toLowerCase();
	return action || undefined;
};

const isDrizzleMigrationsTable = (tableName: string): boolean => {
	return tableName.toLowerCase() === '__drizzle_migrations';
};

export const fromDatabase = async (
	db: DB,
	tablesFilter: (table: string) => boolean = () => true,
	progressCallback?: (
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) => void,
): Promise<FirebirdSchemaInternal> => {
	const result: Record<string, Table> = {};
	const resultViews: Record<string, View> = {};
	const internal: FirebirdKitInternals = { indexes: {} };

	let columnsCount = 0;
	let tablesCount = 0;
	let indexesCount = 0;
	let foreignKeysCount = 0;
	let checksCount = 0;

	const columns = await db.query<{
		relationName: string;
		relationType: 'table' | 'view';
		columnName: string;
		position: number;
		fieldType: number;
		fieldSubType: number | null;
		fieldScale: number | null;
		fieldPrecision: number | null;
		characterLength: number | null;
		nullFlag: number | null;
		defaultSource: string | null;
		computedSource: string | null;
		identityType: number | null;
		generatorName: string | null;
	}>(`
		select
			trim(rf.rdb$relation_name) as "relationName",
			case when r.rdb$view_blr is null then 'table' else 'view' end as "relationType",
			trim(rf.rdb$field_name) as "columnName",
			rf.rdb$field_position as "position",
			f.rdb$field_type as "fieldType",
			f.rdb$field_sub_type as "fieldSubType",
			f.rdb$field_scale as "fieldScale",
			f.rdb$field_precision as "fieldPrecision",
			f.rdb$character_length as "characterLength",
			coalesce(rf.rdb$null_flag, f.rdb$null_flag, 0) as "nullFlag",
			cast(coalesce(rf.rdb$default_source, f.rdb$default_source) as varchar(8191)) as "defaultSource",
			cast(f.rdb$computed_source as varchar(8191)) as "computedSource",
			rf.rdb$identity_type as "identityType",
			trim(rf.rdb$generator_name) as "generatorName"
		from rdb$relation_fields rf
		join rdb$fields f on f.rdb$field_name = rf.rdb$field_source
		join rdb$relations r on r.rdb$relation_name = rf.rdb$relation_name
		where coalesce(r.rdb$system_flag, 0) = 0
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
		order by rf.rdb$relation_name, rf.rdb$field_position
	`);

	const seenTables = new Set<string>();
	const seenViews = new Set<string>();

	for (const row of columns) {
		const relationName = trimFirebirdIdentifier(row.relationName);
		if (!relationName || isDrizzleMigrationsTable(relationName) || !tablesFilter(relationName)) {
			continue;
		}

		const columnName = trimFirebirdIdentifier(row.columnName);
		const isView = row.relationType === 'view';
		const target = isView ? resultViews : result;

		const identityType = row.identityType === null || row.identityType === undefined ? undefined : Number(row.identityType);
		const identity: Identity | undefined = identityType === undefined
			? undefined
			: {
				type: identityType === 0 ? 'always' : 'byDefault',
				name: trimFirebirdIdentifier(row.generatorName) || `${relationName}_${columnName}_seq`,
			};

		const computedSource = sourceToString(row.computedSource);

		const columnToSet: Column = {
			name: columnName,
			type: mapFirebirdColumnType(row),
			primaryKey: false,
			notNull: Number(row.nullFlag ?? 0) === 1,
			autoincrement: !!identity,
			identity,
			default: defaultSourceToSnapshotValue(row.defaultSource),
			generated: computedSource
				? {
					as: computedSource,
					type: 'virtual',
				}
				: undefined,
		};

		if (!target[relationName]) {
			if (isView) {
				target[relationName] = {
					name: relationName,
					columns: {},
					isExisting: false,
				};
				seenViews.add(relationName);
			} else {
				target[relationName] = {
					name: relationName,
					columns: {},
					indexes: {},
					foreignKeys: {},
					compositePrimaryKeys: {},
					uniqueConstraints: {},
					checkConstraints: {},
				};
				seenTables.add(relationName);
			}
		}

		target[relationName]!.columns[columnName] = columnToSet;
		if (isView) {
			progressCallback?.('views', seenViews.size, 'fetching');
		} else {
			columnsCount += 1;
			progressCallback?.('columns', columnsCount, 'fetching');
			tablesCount = seenTables.size;
			progressCallback?.('tables', tablesCount, 'fetching');
		}
	}

	const primaryKeyRows = await db.query<{
		tableName: string;
		constraintName: string;
		columnName: string;
		position: number;
	}>(`
		select
			trim(rc.rdb$relation_name) as "tableName",
			trim(rc.rdb$constraint_name) as "constraintName",
			trim(s.rdb$field_name) as "columnName",
			s.rdb$field_position as "position"
		from rdb$relation_constraints rc
		join rdb$index_segments s on s.rdb$index_name = rc.rdb$index_name
		join rdb$relations r on r.rdb$relation_name = rc.rdb$relation_name
		where coalesce(r.rdb$system_flag, 0) = 0
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
			and trim(rc.rdb$constraint_type) = 'PRIMARY KEY'
		order by rc.rdb$relation_name, rc.rdb$constraint_name, s.rdb$field_position
	`);

	const primaryKeys = Object.values(groupConstraintColumns(primaryKeyRows.map((row) => ({
		tableName: trimFirebirdIdentifier(row.tableName),
		constraintName: trimFirebirdIdentifier(row.constraintName),
		columnName: trimFirebirdIdentifier(row.columnName),
		position: Number(row.position ?? 0),
	})))).filter((pk) => tablesFilter(pk.tableName));

	for (const pk of primaryKeys) {
		const table = result[pk.tableName];
		if (!table) continue;

		const columns = pk.columns.filter(Boolean);
		if (columns.length === 1) {
			table.columns[columns[0]]!.primaryKey = true;
		} else if (columns.length > 1) {
			table.compositePrimaryKeys[pk.constraintName] = {
				name: pk.constraintName,
				columns,
			};
		}
	}

	const uniqueRows = await db.query<{
		tableName: string;
		constraintName: string;
		columnName: string;
		position: number;
	}>(`
		select
			trim(rc.rdb$relation_name) as "tableName",
			trim(rc.rdb$constraint_name) as "constraintName",
			trim(s.rdb$field_name) as "columnName",
			s.rdb$field_position as "position"
		from rdb$relation_constraints rc
		join rdb$index_segments s on s.rdb$index_name = rc.rdb$index_name
		join rdb$relations r on r.rdb$relation_name = rc.rdb$relation_name
		where coalesce(r.rdb$system_flag, 0) = 0
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
			and trim(rc.rdb$constraint_type) = 'UNIQUE'
		order by rc.rdb$relation_name, rc.rdb$constraint_name, s.rdb$field_position
	`);

	const uniques = Object.values(groupConstraintColumns(uniqueRows.map((row) => ({
		tableName: trimFirebirdIdentifier(row.tableName),
		constraintName: trimFirebirdIdentifier(row.constraintName),
		columnName: trimFirebirdIdentifier(row.columnName),
		position: Number(row.position ?? 0),
	})))).filter((unique) => tablesFilter(unique.tableName));

	for (const unique of uniques) {
		const table = result[unique.tableName];
		if (!table) continue;
		table.indexes[unique.constraintName] = {
			name: unique.constraintName,
			columns: unique.columns.filter(Boolean),
			isUnique: true,
		};
	}

	const foreignKeyRows = await db.query<{
		tableFrom: string;
		constraintName: string;
		tableTo: string;
		columnFrom: string;
		columnTo: string;
		onUpdate: string | null;
		onDelete: string | null;
		position: number;
	}>(`
		select
			trim(rc.rdb$relation_name) as "tableFrom",
			trim(rc.rdb$constraint_name) as "constraintName",
			trim(refc.rdb$relation_name) as "tableTo",
			trim(isc.rdb$field_name) as "columnFrom",
			trim(refs.rdb$field_name) as "columnTo",
			trim(ref.rdb$update_rule) as "onUpdate",
			trim(ref.rdb$delete_rule) as "onDelete",
			isc.rdb$field_position as "position"
		from rdb$relation_constraints rc
		join rdb$ref_constraints ref on ref.rdb$constraint_name = rc.rdb$constraint_name
		join rdb$relation_constraints refc on refc.rdb$constraint_name = ref.rdb$const_name_uq
		join rdb$index_segments isc on isc.rdb$index_name = rc.rdb$index_name
		join rdb$index_segments refs
			on refs.rdb$index_name = refc.rdb$index_name
			and refs.rdb$field_position = isc.rdb$field_position
		join rdb$relations r on r.rdb$relation_name = rc.rdb$relation_name
		where coalesce(r.rdb$system_flag, 0) = 0
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
			and trim(rc.rdb$constraint_type) = 'FOREIGN KEY'
		order by rc.rdb$relation_name, rc.rdb$constraint_name, isc.rdb$field_position
	`);

	const foreignKeys = foreignKeyRows.reduce<Record<string, ForeignKey>>((acc, row) => {
		const tableFrom = trimFirebirdIdentifier(row.tableFrom);
		if (!tablesFilter(tableFrom)) return acc;

		const constraintName = trimFirebirdIdentifier(row.constraintName);
		const key = `${tableFrom}.${constraintName}`;
		acc[key] ??= {
			name: constraintName,
			tableFrom,
			tableTo: trimFirebirdIdentifier(row.tableTo),
			columnsFrom: [],
			columnsTo: [],
			onUpdate: toAction(row.onUpdate),
			onDelete: toAction(row.onDelete),
		};
		acc[key].columnsFrom[Number(row.position ?? 0)] = trimFirebirdIdentifier(row.columnFrom);
		acc[key].columnsTo[Number(row.position ?? 0)] = trimFirebirdIdentifier(row.columnTo);
		return acc;
	}, {});

	for (const fk of Object.values(foreignKeys)) {
		const table = result[fk.tableFrom];
		if (!table) continue;
		fk.columnsFrom = fk.columnsFrom.filter(Boolean);
		fk.columnsTo = fk.columnsTo.filter(Boolean);
		table.foreignKeys[fk.name] = fk;
		foreignKeysCount += 1;
		progressCallback?.('fks', foreignKeysCount, 'fetching');
	}

	const indexes = await db.query<{
		tableName: string;
		indexName: string;
		columnName: string | null;
		position: number | null;
		isUnique: number | null;
		expressionSource: string | null;
		conditionSource: string | null;
	}>(`
		select
			trim(i.rdb$relation_name) as "tableName",
			trim(i.rdb$index_name) as "indexName",
			trim(s.rdb$field_name) as "columnName",
			s.rdb$field_position as "position",
			i.rdb$unique_flag as "isUnique",
			cast(i.rdb$expression_source as varchar(8191)) as "expressionSource",
			cast(i.rdb$condition_source as varchar(8191)) as "conditionSource"
		from rdb$indices i
		left join rdb$index_segments s on s.rdb$index_name = i.rdb$index_name
		join rdb$relations r on r.rdb$relation_name = i.rdb$relation_name
		where coalesce(r.rdb$system_flag, 0) = 0
			and r.rdb$view_blr is null
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
			and not exists (
				select 1
				from rdb$relation_constraints rc
				where rc.rdb$index_name = i.rdb$index_name
			)
		order by i.rdb$relation_name, i.rdb$index_name, s.rdb$field_position
	`);

	for (const row of indexes) {
		const tableName = trimFirebirdIdentifier(row.tableName);
		if (!tablesFilter(tableName)) continue;

		const table = result[tableName];
		if (!table) continue;

		const indexName = trimFirebirdIdentifier(row.indexName);
		const expressionSource = sourceToString(row.expressionSource);
		const conditionSource = sourceToString(row.conditionSource);
		table.indexes[indexName] ??= {
			name: indexName,
			columns: [],
			isUnique: Number(row.isUnique ?? 0) === 1,
			where: conditionSource,
		};

		if (expressionSource) {
			table.indexes[indexName]!.columns = [expressionSource];
			internal.indexes ??= {};
			internal.indexes[indexName] = {
				columns: {
					[expressionSource]: { isExpression: true },
				},
			};
		} else {
			const columnName = trimFirebirdIdentifier(row.columnName);
			if (columnName && !table.indexes[indexName]!.columns.includes(columnName)) {
				table.indexes[indexName]!.columns[Number(row.position ?? table.indexes[indexName]!.columns.length)] = columnName;
			}
		}

		indexesCount += 1;
		progressCallback?.('indexes', indexesCount, 'fetching');
	}

	for (const table of Object.values(result)) {
		for (const index of Object.values(table.indexes)) {
			index.columns = index.columns.filter(Boolean);
		}
	}

	const checks = await db.query<{
		tableName: string;
		constraintName: string;
		checkSource: string | null;
	}>(`
		select
			trim(rc.rdb$relation_name) as "tableName",
			trim(rc.rdb$constraint_name) as "constraintName",
			cast(t.rdb$trigger_source as varchar(8191)) as "checkSource"
		from rdb$relation_constraints rc
		join rdb$check_constraints cc on cc.rdb$constraint_name = rc.rdb$constraint_name
		join rdb$triggers t on t.rdb$trigger_name = cc.rdb$trigger_name
		join rdb$relations r on r.rdb$relation_name = rc.rdb$relation_name
		where coalesce(r.rdb$system_flag, 0) = 0
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
			and trim(rc.rdb$constraint_type) = 'CHECK'
		order by rc.rdb$relation_name, rc.rdb$constraint_name
	`);

	for (const row of checks) {
		const tableName = trimFirebirdIdentifier(row.tableName);
		if (!tablesFilter(tableName)) continue;

		const table = result[tableName];
		const value = checkSourceToSnapshotValue(row.checkSource);
		if (!table || !value) continue;

		const constraintName = trimFirebirdIdentifier(row.constraintName);
		table.checkConstraints[constraintName] = {
			name: constraintName,
			value,
		};
		checksCount += 1;
		progressCallback?.('checks', checksCount, 'fetching');
	}

	const views = await db.query<{
		viewName: string;
		viewSource: string | null;
	}>(`
		select
			trim(r.rdb$relation_name) as "viewName",
			cast(r.rdb$view_source as varchar(8191)) as "viewSource"
		from rdb$relations r
		where coalesce(r.rdb$system_flag, 0) = 0
			and r.rdb$view_blr is not null
			and lower(trim(r.rdb$relation_name)) <> '__drizzle_migrations'
		order by r.rdb$relation_name
	`);

	for (const row of views) {
		const viewName = trimFirebirdIdentifier(row.viewName);
		if (!tablesFilter(viewName)) continue;

		resultViews[viewName] ??= {
			name: viewName,
			columns: {},
			isExisting: false,
		};
		resultViews[viewName]!.definition = sourceToString(row.viewSource) ?? '';
		seenViews.add(viewName);
	}

	progressCallback?.('columns', columnsCount, 'done');
	progressCallback?.('tables', tablesCount, 'done');
	progressCallback?.('indexes', indexesCount, 'done');
	progressCallback?.('fks', foreignKeysCount, 'done');
	progressCallback?.('checks', checksCount, 'done');
	progressCallback?.('views', seenViews.size, 'done');
	progressCallback?.('enums', 0, 'done');

	return {
		version: '6',
		dialect: 'firebird',
		tables: result,
		views: resultViews,
		enums: {},
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};
