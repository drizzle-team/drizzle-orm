import {
	any,
	array,
	boolean,
	enum as enumType,
	literal,
	never,
	number,
	object,
	record,
	string,
	TypeOf,
	union,
	ZodTypeAny,
} from 'zod';
import { applyJsonDiff, diffColumns, diffSchemasOrTables } from './jsonDiffer';
import { fromJson } from './sqlgenerator';

import {
	_prepareAddColumns,
	_prepareDropColumns,
	_prepareSqliteAddColumns,
	JsonAddColumnStatement,
	JsonAlterCompositePK,
	JsonAlterTableSetSchema,
	JsonAlterUniqueConstraint,
	JsonCreateCompositePK,
	JsonCreateReferenceStatement,
	JsonCreateUniqueConstraint,
	JsonDeleteCompositePK,
	JsonDeleteUniqueConstraint,
	JsonDropColumnStatement,
	JsonReferenceStatement,
	JsonRenameColumnStatement,
	JsonSqliteAddColumnStatement,
	JsonStatement,
	prepareAddCompositePrimaryKeyMySql,
	prepareAddCompositePrimaryKeyPg,
	prepareAddCompositePrimaryKeySqlite,
	prepareAddUniqueConstraintPg as prepareAddUniqueConstraint,
	prepareAddValuesToEnumJson,
	prepareAlterColumnsMysql,
	prepareAlterCompositePrimaryKeyMySql,
	prepareAlterCompositePrimaryKeyPg,
	prepareAlterCompositePrimaryKeySqlite,
	prepareAlterReferencesJson,
	prepareAlterSequenceJson,
	prepareCreateEnumJson,
	prepareCreateIndexesJson,
	prepareCreateReferencesJson,
	prepareCreateSchemasJson,
	prepareCreateSequenceJson,
	prepareDeleteCompositePrimaryKeyMySql,
	prepareDeleteCompositePrimaryKeyPg,
	prepareDeleteCompositePrimaryKeySqlite,
	prepareDeleteSchemasJson as prepareDropSchemasJson,
	prepareDeleteUniqueConstraintPg as prepareDeleteUniqueConstraint,
	prepareDropEnumJson,
	prepareDropIndexesJson,
	prepareDropReferencesJson,
	prepareDropSequenceJson,
	prepareDropTableJson,
	prepareMoveEnumJson,
	prepareMoveSequenceJson,
	prepareMySqlCreateTableJson,
	preparePgAlterColumns,
	preparePgCreateIndexesJson,
	preparePgCreateTableJson,
	prepareRenameColumns,
	prepareRenameEnumJson,
	prepareRenameSchemasJson,
	prepareRenameSequenceJson,
	prepareRenameTableJson,
	prepareSqliteAlterColumns,
	prepareSQLiteCreateTable,
} from './jsonStatements';

import { Named, NamedWithSchema } from './cli/commands/migrate';
import { mapEntries, mapKeys, mapValues } from './global';
import { MySqlSchema, MySqlSchemaSquashed, MySqlSquasher } from './serializer/mysqlSchema';
import { PgSchema, PgSchemaSquashed, PgSquasher, sequenceSchema, sequenceSquashed } from './serializer/pgSchema';
import { SQLiteSchema, SQLiteSchemaSquashed, SQLiteSquasher } from './serializer/sqliteSchema';
import { copy, prepareMigrationMeta } from './utils';

const makeChanged = <T extends ZodTypeAny>(schema: T) => {
	return object({
		type: enumType(['changed']),
		old: schema,
		new: schema,
	});
};

const makeSelfOrChanged = <T extends ZodTypeAny>(schema: T) => {
	return union([
		schema,
		object({
			type: enumType(['changed']),
			old: schema,
			new: schema,
		}),
	]);
};

export const makePatched = <T extends ZodTypeAny>(schema: T) => {
	return union([
		object({
			type: literal('added'),
			value: schema,
		}),
		object({
			type: literal('deleted'),
			value: schema,
		}),
		object({
			type: literal('changed'),
			old: schema,
			new: schema,
		}),
	]);
};

export const makeSelfOrPatched = <T extends ZodTypeAny>(schema: T) => {
	return union([
		object({
			type: literal('none'),
			value: schema,
		}),
		object({
			type: literal('added'),
			value: schema,
		}),
		object({
			type: literal('deleted'),
			value: schema,
		}),
		object({
			type: literal('changed'),
			old: schema,
			new: schema,
		}),
	]);
};

const columnSchema = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(),
	primaryKey: boolean().optional(),
	default: any().optional(),
	notNull: boolean().optional(),
	// should it be optional? should if be here?
	autoincrement: boolean().optional(),
	onUpdate: boolean().optional(),
	isUnique: any().optional(),
	uniqueName: string().optional(),
	nullsNotDistinct: boolean().optional(),
	generated: object({
		as: string(),
		type: enumType(['stored', 'virtual']).default('stored'),
	}).optional(),
	identity: string().optional(),
}).strict();

const alteredColumnSchema = object({
	name: makeSelfOrChanged(string()),
	type: makeChanged(string()).optional(),
	default: makePatched(any()).optional(),
	primaryKey: makePatched(boolean()).optional(),
	notNull: makePatched(boolean()).optional(),
	typeSchema: makePatched(string()).optional(),
	onUpdate: makePatched(boolean()).optional(),
	autoincrement: makePatched(boolean()).optional(),
	generated: makePatched(
		object({
			as: string(),
			type: enumType(['stored', 'virtual']).default('stored'),
		}),
	).optional(),

	identity: makePatched(string()).optional(),
}).strict();

const enumSchema = object({
	name: string(),
	schema: string(),
	values: array(string()),
}).strict();

const changedEnumSchema = object({
	name: string(),
	schema: string(),
	addedValues: object({
		before: string(),
		value: string(),
	}).array(),
	deletedValues: array(string()),
}).strict();

const tableScheme = object({
	name: string(),
	schema: string().default(''),
	columns: record(string(), columnSchema),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
	compositePrimaryKeys: record(string(), string()).default({}),
	uniqueConstraints: record(string(), string()).default({}),
}).strict();

export const alteredTableScheme = object({
	name: string(),
	schema: string(),
	altered: alteredColumnSchema.array(),
	addedIndexes: record(string(), string()),
	deletedIndexes: record(string(), string()),
	alteredIndexes: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}).strict(),
	),
	addedForeignKeys: record(string(), string()),
	deletedForeignKeys: record(string(), string()),
	alteredForeignKeys: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}).strict(),
	),
	addedCompositePKs: record(string(), string()),
	deletedCompositePKs: record(string(), string()),
	alteredCompositePKs: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
	addedUniqueConstraints: record(string(), string()),
	deletedUniqueConstraints: record(string(), string()),
	alteredUniqueConstraints: record(
		string(),
		object({
			__new: string(),
			__old: string(),
		}),
	),
}).strict();

export const diffResultScheme = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: changedEnumSchema.array(),
	alteredSequences: sequenceSquashed.array(),
}).strict();

export const diffResultSchemeMysql = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: never().array(),
});

export const diffResultSchemeSQLite = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: never().array(),
});

export type Column = TypeOf<typeof columnSchema>;
export type AlteredColumn = TypeOf<typeof alteredColumnSchema>;
export type Enum = TypeOf<typeof enumSchema>;
export type Sequence = TypeOf<typeof sequenceSquashed>;
export type Table = TypeOf<typeof tableScheme>;
export type AlteredTable = TypeOf<typeof alteredTableScheme>;
export type DiffResult = TypeOf<typeof diffResultScheme>;
export type DiffResultMysql = TypeOf<typeof diffResultSchemeMysql>;
export type DiffResultSQLite = TypeOf<typeof diffResultSchemeSQLite>;

export interface ResolverInput<T extends { name: string }> {
	created: T[];
	deleted: T[];
}

export interface ResolverOutput<T extends { name: string }> {
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ResolverOutputWithMoved<T extends { name: string }> {
	created: T[];
	moved: { name: string; schemaFrom: string; schemaTo: string }[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ColumnsResolverInput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	deleted: T[];
}

export interface ColumnsResolverOutput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

const schemaChangeFor = (
	table: NamedWithSchema,
	renamedSchemas: { from: Named; to: Named }[],
) => {
	for (let ren of renamedSchemas) {
		if (table.schema === ren.from.name) {
			return { key: `${ren.to.name}.${table.name}`, schema: ren.to.name };
		}
	}

	return {
		key: `${table.schema || 'public'}.${table.name}`,
		schema: table.schema,
	};
};

const nameChangeFor = (table: Named, renamed: { from: Named; to: Named }[]) => {
	for (let ren of renamed) {
		if (table.name === ren.from.name) {
			return { name: ren.to.name };
		}
	}

	return {
		name: table.name,
	};
};

const nameSchemaChangeFor = (
	table: NamedWithSchema,
	renamedTables: { from: NamedWithSchema; to: NamedWithSchema }[],
) => {
	for (let ren of renamedTables) {
		if (table.name === ren.from.name && table.schema === ren.from.schema) {
			return {
				key: `${ren.to.schema || 'public'}.${ren.to.name}`,
				name: ren.to.name,
				schema: ren.to.schema,
			};
		}
	}

	return {
		key: `${table.schema || 'public'}.${table.name}`,
		name: table.name,
		schema: table.schema,
	};
};

const columnChangeFor = (
	column: string,
	renamedColumns: { from: Named; to: Named }[],
) => {
	for (let ren of renamedColumns) {
		if (column === ren.from.name) {
			return ren.to.name;
		}
	}

	return column;
};

export const applyPgSnapshotsDiff = async (
	json1: PgSchemaSquashed,
	json2: PgSchemaSquashed,
	schemasResolver: (
		input: ResolverInput<Named>,
	) => Promise<ResolverOutput<Named>>,
	enumsResolver: (
		input: ResolverInput<Enum>,
	) => Promise<ResolverOutputWithMoved<Enum>>,
	sequencesResolver: (
		input: ResolverInput<Sequence>,
	) => Promise<ResolverOutputWithMoved<Sequence>>,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	prevFull: PgSchema,
	curFull: PgSchema,
	action?: 'push' | undefined,
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	_meta:
		| {
			schemas: {};
			tables: {};
			columns: {};
		}
		| undefined;
}> => {
	const schemasDiff = diffSchemasOrTables(json1.schemas, json2.schemas);

	const {
		created: createdSchemas,
		deleted: deletedSchemas,
		renamed: renamedSchemas,
	} = await schemasResolver({
		created: schemasDiff.added.map((it) => ({ name: it })),
		deleted: schemasDiff.deleted.map((it) => ({ name: it })),
	});

	const schemasPatchedSnap1 = copy(json1);
	schemasPatchedSnap1.tables = mapEntries(
		schemasPatchedSnap1.tables,
		(_, it) => {
			const { key, schema } = schemaChangeFor(it, renamedSchemas);
			it.schema = schema;
			return [key, it];
		},
	);

	schemasPatchedSnap1.enums = mapEntries(schemasPatchedSnap1.enums, (_, it) => {
		const { key, schema } = schemaChangeFor(it, renamedSchemas);
		it.schema = schema;
		return [key, it];
	});

	const enumsDiff = diffSchemasOrTables(schemasPatchedSnap1.enums, json2.enums);

	const {
		created: createdEnums,
		deleted: deletedEnums,
		renamed: renamedEnums,
		moved: movedEnums,
	} = await enumsResolver({
		created: enumsDiff.added,
		deleted: enumsDiff.deleted,
	});

	schemasPatchedSnap1.enums = mapEntries(schemasPatchedSnap1.enums, (_, it) => {
		const { key, name, schema } = nameSchemaChangeFor(it, renamedEnums);
		it.name = name;
		it.schema = schema;
		return [key, it];
	});

	const columnTypesChangeMap = renamedEnums.reduce(
		(acc, it) => {
			acc[`${it.from.schema}.${it.from.name}`] = {
				nameFrom: it.from.name,
				nameTo: it.to.name,
				schemaFrom: it.from.schema,
				schemaTo: it.to.schema,
			};
			return acc;
		},
		{} as Record<
			string,
			{
				nameFrom: string;
				nameTo: string;
				schemaFrom: string;
				schemaTo: string;
			}
		>,
	);

	const columnTypesMovesMap = movedEnums.reduce(
		(acc, it) => {
			acc[`${it.schemaFrom}.${it.name}`] = {
				nameFrom: it.name,
				nameTo: it.name,
				schemaFrom: it.schemaFrom,
				schemaTo: it.schemaTo,
			};
			return acc;
		},
		{} as Record<
			string,
			{
				nameFrom: string;
				nameTo: string;
				schemaFrom: string;
				schemaTo: string;
			}
		>,
	);

	schemasPatchedSnap1.tables = mapEntries(
		schemasPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedColumns = mapValues(tableValue.columns, (column) => {
				const key = `${column.typeSchema || 'public'}.${column.type}`;
				const change = columnTypesChangeMap[key] || columnTypesMovesMap[key];

				if (change) {
					column.type = change.nameTo;
					column.typeSchema = change.schemaTo;
				}

				return column;
			});

			tableValue.columns = patchedColumns;
			return [tableKey, tableValue];
		},
	);

	schemasPatchedSnap1.sequences = mapEntries(
		schemasPatchedSnap1.sequences,
		(_, it) => {
			const { key, schema } = schemaChangeFor(it, renamedSchemas);
			it.schema = schema;
			return [key, it];
		},
	);

	const sequencesDiff = diffSchemasOrTables(
		schemasPatchedSnap1.sequences,
		json2.sequences,
	);

	const {
		created: createdSequences,
		deleted: deletedSequences,
		renamed: renamedSequences,
		moved: movedSequences,
	} = await sequencesResolver({
		created: sequencesDiff.added,
		deleted: sequencesDiff.deleted,
	});

	schemasPatchedSnap1.sequences = mapEntries(
		schemasPatchedSnap1.sequences,
		(_, it) => {
			const { key, name, schema } = nameSchemaChangeFor(it, renamedSequences);
			it.name = name;
			it.schema = schema;
			return [key, it];
		},
	);

	const sequencesChangeMap = renamedSequences.reduce(
		(acc, it) => {
			acc[`${it.from.schema}.${it.from.name}`] = {
				nameFrom: it.from.name,
				nameTo: it.to.name,
				schemaFrom: it.from.schema,
				schemaTo: it.to.schema,
			};
			return acc;
		},
		{} as Record<
			string,
			{
				nameFrom: string;
				nameTo: string;
				schemaFrom: string;
				schemaTo: string;
			}
		>,
	);

	const sequencesMovesMap = movedSequences.reduce(
		(acc, it) => {
			acc[`${it.schemaFrom}.${it.name}`] = {
				nameFrom: it.name,
				nameTo: it.name,
				schemaFrom: it.schemaFrom,
				schemaTo: it.schemaTo,
			};
			return acc;
		},
		{} as Record<
			string,
			{
				nameFrom: string;
				nameTo: string;
				schemaFrom: string;
				schemaTo: string;
			}
		>,
	);

	schemasPatchedSnap1.tables = mapEntries(
		schemasPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedColumns = mapValues(tableValue.columns, (column) => {
				const key = `${column.typeSchema || 'public'}.${column.type}`;
				const change = sequencesChangeMap[key] || sequencesMovesMap[key];

				if (change) {
					column.type = change.nameTo;
					column.typeSchema = change.schemaTo;
				}

				return column;
			});

			tableValue.columns = patchedColumns;
			return [tableKey, tableValue];
		},
	);

	const tablesDiff = diffSchemasOrTables(
		schemasPatchedSnap1.tables as Record<string, any>,
		json2.tables,
	);

	const {
		created: createdTables,
		deleted: deletedTables,
		moved: movedTables,
		renamed: renamedTables, // renamed or moved
	} = await tablesResolver({
		created: tablesDiff.added,
		deleted: tablesDiff.deleted,
	});

	const tablesPatchedSnap1 = copy(schemasPatchedSnap1);
	tablesPatchedSnap1.tables = mapEntries(tablesPatchedSnap1.tables, (_, it) => {
		const { key, name, schema } = nameSchemaChangeFor(it, renamedTables);
		it.name = name;
		it.schema = schema;
		return [key, it];
	});

	const res = diffColumns(tablesPatchedSnap1.tables, json2.tables);

	const columnRenames = [] as {
		table: string;
		schema: string;
		renames: { from: Column; to: Column }[];
	}[];

	const columnCreates = [] as {
		table: string;
		schema: string;
		columns: Column[];
	}[];

	const columnDeletes = [] as {
		table: string;
		schema: string;
		columns: Column[];
	}[];

	for (let entry of Object.values(res)) {
		const { renamed, created, deleted } = await columnsResolver({
			tableName: entry.name,
			schema: entry.schema,
			deleted: entry.columns.deleted,
			created: entry.columns.added,
		});

		if (created.length > 0) {
			columnCreates.push({
				table: entry.name,
				schema: entry.schema,
				columns: created,
			});
		}

		if (deleted.length > 0) {
			columnDeletes.push({
				table: entry.name,
				schema: entry.schema,
				columns: deleted,
			});
		}

		if (renamed.length > 0) {
			columnRenames.push({
				table: entry.name,
				schema: entry.schema,
				renames: renamed,
			});
		}
	}

	const columnRenamesDict = columnRenames.reduce(
		(acc, it) => {
			acc[`${it.schema || 'public'}.${it.table}`] = it.renames;
			return acc;
		},
		{} as Record<
			string,
			{
				from: Named;
				to: Named;
			}[]
		>,
	);

	const columnsPatchedSnap1 = copy(tablesPatchedSnap1);
	columnsPatchedSnap1.tables = mapEntries(
		columnsPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedColumns = mapKeys(
				tableValue.columns,
				(columnKey, column) => {
					const rens = columnRenamesDict[
						`${tableValue.schema || 'public'}.${tableValue.name}`
					] || [];

					const newName = columnChangeFor(columnKey, rens);
					column.name = newName;
					return newName;
				},
			);

			tableValue.columns = patchedColumns;
			return [tableKey, tableValue];
		},
	);

	const diffResult = applyJsonDiff(columnsPatchedSnap1, json2);

	// no diffs
	const typedResult: DiffResult = diffResultScheme.parse(diffResult);
	// const typedResult: DiffResult = {};

	const jsonStatements: JsonStatement[] = [];

	const jsonCreateIndexesForCreatedTables = createdTables
		.map((it) => {
			return preparePgCreateIndexesJson(
				it.name,
				it.schema,
				it.indexes,
				curFull,
				action,
			);
		})
		.flat();

	const jsonDropTables = deletedTables.map((it) => {
		return prepareDropTableJson(it);
	});

	const jsonRenameTables = renamedTables.map((it) => {
		return prepareRenameTableJson(it.from, it.to);
	});

	const alteredTables = typedResult.alteredTablesWithColumns;

	const jsonRenameColumnsStatements: JsonRenameColumnStatement[] = [];
	const jsonDropColumnsStatemets: JsonDropColumnStatement[] = [];
	const jsonAddColumnsStatemets: JsonAddColumnStatement[] = [];

	for (let it of columnRenames) {
		jsonRenameColumnsStatements.push(
			...prepareRenameColumns(it.table, it.schema, it.renames),
		);
	}

	for (let it of columnDeletes) {
		jsonDropColumnsStatemets.push(
			..._prepareDropColumns(it.table, it.schema, it.columns),
		);
	}

	for (let it of columnCreates) {
		jsonAddColumnsStatemets.push(
			..._prepareAddColumns(it.table, it.schema, it.columns),
		);
	}

	const jsonAddedCompositePKs: JsonCreateCompositePK[] = [];
	const jsonDeletedCompositePKs: JsonDeleteCompositePK[] = [];
	const jsonAlteredCompositePKs: JsonAlterCompositePK[] = [];

	const jsonAddedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
	const jsonDeletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
	const jsonAlteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

	const jsonSetTableSchemas: JsonAlterTableSetSchema[] = [];

	for (let it of movedTables) {
		jsonSetTableSchemas.push({
			type: 'alter_table_set_schema',
			tableName: it.name,
			schemaFrom: it.schemaFrom || 'public',
			schemaTo: it.schemaTo || 'public',
		});
	}

	for (let it of alteredTables) {
		// This part is needed to make sure that same columns in a table are not triggered for change
		// there is a case where orm and kit are responsible for pk name generation and one of them is not sorting name
		// We double-check that pk with same set of columns are both in added and deleted diffs
		let addedColumns: string[] = [];
		for (const addedPkName of Object.keys(it.addedCompositePKs)) {
			const addedPkColumns = it.addedCompositePKs[addedPkName];
			addedColumns = SQLiteSquasher.unsquashPK(addedPkColumns);
		}

		let deletedColumns: string[] = [];
		for (const deletedPkName of Object.keys(it.deletedCompositePKs)) {
			const deletedPkColumns = it.deletedCompositePKs[deletedPkName];
			deletedColumns = SQLiteSquasher.unsquashPK(deletedPkColumns);
		}

		// Don't need to sort, but need to add tests for it
		// addedColumns.sort();
		// deletedColumns.sort();
		const doPerformDeleteAndCreate = JSON.stringify(addedColumns) !== JSON.stringify(deletedColumns);

		let addedCompositePKs: JsonCreateCompositePK[] = [];
		let deletedCompositePKs: JsonDeleteCompositePK[] = [];
		let alteredCompositePKs: JsonAlterCompositePK[] = [];
		if (doPerformDeleteAndCreate) {
			addedCompositePKs = prepareAddCompositePrimaryKeyPg(
				it.name,
				it.schema,
				it.addedCompositePKs,
				curFull as PgSchema,
			);
			deletedCompositePKs = prepareDeleteCompositePrimaryKeyPg(
				it.name,
				it.schema,
				it.deletedCompositePKs,
				prevFull as PgSchema,
			);
		}
		alteredCompositePKs = prepareAlterCompositePrimaryKeyPg(
			it.name,
			it.schema,
			it.alteredCompositePKs,
			prevFull as PgSchema,
			curFull as PgSchema,
		);

		// add logic for unique constraints
		let addedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
		let deletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
		let alteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

		addedUniqueConstraints = prepareAddUniqueConstraint(
			it.name,
			it.schema,
			it.addedUniqueConstraints,
		);
		deletedUniqueConstraints = prepareDeleteUniqueConstraint(
			it.name,
			it.schema,
			it.deletedUniqueConstraints,
		);
		if (it.alteredUniqueConstraints) {
			const added: Record<string, string> = {};
			const deleted: Record<string, string> = {};
			for (const k of Object.keys(it.alteredUniqueConstraints)) {
				added[k] = it.alteredUniqueConstraints[k].__new;
				deleted[k] = it.alteredUniqueConstraints[k].__old;
			}
			addedUniqueConstraints.push(
				...prepareAddUniqueConstraint(it.name, it.schema, added),
			);
			deletedUniqueConstraints.push(
				...prepareDeleteUniqueConstraint(it.name, it.schema, deleted),
			);
		}

		jsonAddedCompositePKs.push(...addedCompositePKs);
		jsonDeletedCompositePKs.push(...deletedCompositePKs);
		jsonAlteredCompositePKs.push(...alteredCompositePKs);

		jsonAddedUniqueConstraints.push(...addedUniqueConstraints);
		jsonDeletedUniqueConstraints.push(...deletedUniqueConstraints);
		jsonAlteredUniqueConstraints.push(...alteredUniqueConstraints);
	}

	const rColumns = jsonRenameColumnsStatements.map((it) => {
		const tableName = it.tableName;
		const schema = it.schema;
		return {
			from: { schema, table: tableName, column: it.oldColumnName },
			to: { schema, table: tableName, column: it.newColumnName },
		};
	});

	const jsonTableAlternations = alteredTables
		.map((it) => {
			return preparePgAlterColumns(
				it.name,
				it.schema,
				it.altered,
				json2,
				action,
			);
		})
		.flat();

	const jsonCreateIndexesFoAlteredTables = alteredTables
		.map((it) => {
			return preparePgCreateIndexesJson(
				it.name,
				it.schema,
				it.addedIndexes || {},
				curFull,
				action,
			);
		})
		.flat();

	const jsonDropIndexesForAllAlteredTables = alteredTables
		.map((it) => {
			return prepareDropIndexesJson(
				it.name,
				it.schema,
				it.deletedIndexes || {},
			);
		})
		.flat();

	alteredTables.forEach((it) => {
		const droppedIndexes = Object.keys(it.alteredIndexes).reduce(
			(current, item: string) => {
				current[item] = it.alteredIndexes[item].__old;
				return current;
			},
			{} as Record<string, string>,
		);
		const createdIndexes = Object.keys(it.alteredIndexes).reduce(
			(current, item: string) => {
				current[item] = it.alteredIndexes[item].__new;
				return current;
			},
			{} as Record<string, string>,
		);

		jsonCreateIndexesFoAlteredTables.push(
			...preparePgCreateIndexesJson(
				it.name,
				it.schema,
				createdIndexes || {},
				curFull,
				action,
			),
		);
		jsonDropIndexesForAllAlteredTables.push(
			...prepareDropIndexesJson(it.name, it.schema, droppedIndexes || {}),
		);
	});

	const jsonCreateReferencesForCreatedTables: JsonCreateReferenceStatement[] = createdTables
		.map((it) => {
			return prepareCreateReferencesJson(it.name, it.schema, it.foreignKeys);
		})
		.flat();

	const jsonReferencesForAlteredTables: JsonReferenceStatement[] = alteredTables
		.map((it) => {
			const forAdded = prepareCreateReferencesJson(
				it.name,
				it.schema,
				it.addedForeignKeys,
			);

			const forAltered = prepareDropReferencesJson(
				it.name,
				it.schema,
				it.deletedForeignKeys,
			);

			const alteredFKs = prepareAlterReferencesJson(
				it.name,
				it.schema,
				it.alteredForeignKeys,
			);

			return [...forAdded, ...forAltered, ...alteredFKs];
		})
		.flat();

	const jsonCreatedReferencesForAlteredTables = jsonReferencesForAlteredTables.filter((t) =>
		t.type === 'create_reference'
	);

	const jsonDroppedReferencesForAlteredTables = jsonReferencesForAlteredTables.filter((t) =>
		t.type === 'delete_reference'
	);

	// Sequences
	// - create sequence ✅
	// - create sequence inside schema ✅
	// - rename sequence ✅
	// - change sequence schema ✅
	// - change sequence schema + name ✅
	// - drop sequence - check if sequence is in use. If yes - ???
	// - change sequence values ✅

	// Generated columns
	// - add generated
	// - drop generated
	// - create table with generated
	// - alter - should be not triggered, but should get warning

	// TODO:
	// let hasEnumValuesDeletions = false;
	// let enumValuesDeletions: { name: string; schema: string; values: string[] }[] =
	//   [];
	// for (let alteredEnum of typedResult.alteredEnums) {
	//   if (alteredEnum.deletedValues.length > 0) {
	//     hasEnumValuesDeletions = true;
	//     enumValuesDeletions.push({
	//       name: alteredEnum.name,
	//       schema: alteredEnum.schema,
	//       values: alteredEnum.deletedValues,
	//     });
	//   }
	// }
	// if (hasEnumValuesDeletions) {
	//   console.log(error("Deletion of enum values is prohibited in Postgres - see here"));
	//   for(let entry of enumValuesDeletions){
	//     console.log(error(`You're trying to delete ${chalk.blue(`[${entry.values.join(", ")}]`)} values from ${chalk.blue(`${entry.schema}.${entry.name}`)}`))
	//   }
	// }
	// if (hasEnumValuesDeletions && action === "push") {
	//   process.exit(1);
	// }

	const createEnums = createdEnums.map((it) => {
		return prepareCreateEnumJson(it.name, it.schema, it.values);
	}) ?? [];

	const dropEnums = deletedEnums.map((it) => {
		return prepareDropEnumJson(it.name, it.schema);
	});

	const moveEnums = movedEnums.map((it) => {
		return prepareMoveEnumJson(it.name, it.schemaFrom, it.schemaTo);
	});

	const renameEnums = renamedEnums.map((it) => {
		return prepareRenameEnumJson(it.from.name, it.to.name, it.to.schema);
	});

	// todo: block enum rename, enum value rename and enun deletion for now
	const jsonAlterEnumsWithAddedValues = typedResult.alteredEnums
		.map((it) => {
			return prepareAddValuesToEnumJson(it.name, it.schema, it.addedValues);
		})
		.flat() ?? [];

	///////////

	const createSequences = createdSequences.map((it) => {
		return prepareCreateSequenceJson(it);
	}) ?? [];

	const dropSequences = deletedSequences.map((it) => {
		return prepareDropSequenceJson(it.name, it.schema);
	});

	const moveSequences = movedSequences.map((it) => {
		return prepareMoveSequenceJson(it.name, it.schemaFrom, it.schemaTo);
	});

	const renameSequences = renamedSequences.map((it) => {
		return prepareRenameSequenceJson(it.from.name, it.to.name, it.to.schema);
	});

	const jsonAlterSequences = typedResult.alteredSequences
		.map((it) => {
			return prepareAlterSequenceJson(it);
		})
		.flat() ?? [];

	////////////

	const createSchemas = prepareCreateSchemasJson(
		createdSchemas.map((it) => it.name),
	);

	const renameSchemas = prepareRenameSchemasJson(
		renamedSchemas.map((it) => ({ from: it.from.name, to: it.to.name })),
	);

	const dropSchemas = prepareDropSchemasJson(
		deletedSchemas.map((it) => it.name),
	);

	const createTables = createdTables.map((it) => {
		return preparePgCreateTableJson(it, curFull);
	});

	jsonStatements.push(...createSchemas);
	jsonStatements.push(...renameSchemas);
	jsonStatements.push(...createEnums);
	jsonStatements.push(...moveEnums);
	jsonStatements.push(...renameEnums);
	jsonStatements.push(...jsonAlterEnumsWithAddedValues);

	jsonStatements.push(...createSequences);
	jsonStatements.push(...moveSequences);
	jsonStatements.push(...renameSequences);
	jsonStatements.push(...jsonAlterSequences);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDeletedUniqueConstraints);

	jsonStatements.push(...jsonDroppedReferencesForAlteredTables);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDeletedCompositePKs);
	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonCreateReferencesForCreatedTables);
	jsonStatements.push(...jsonCreateIndexesForCreatedTables);

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);
	jsonStatements.push(...jsonCreateIndexesFoAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonAddedUniqueConstraints);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	jsonStatements.push(...dropEnums);
	jsonStatements.push(...dropSequences);
	jsonStatements.push(...dropSchemas);

	// generate filters
	const filteredJsonStatements = jsonStatements.filter((st) => {
		if (st.type === 'alter_table_alter_column_drop_notnull') {
			if (
				jsonStatements.find(
					(it) =>
						it.type === 'alter_table_alter_column_drop_identity'
						&& it.tableName === st.tableName
						&& it.schema === st.schema,
				)
			) {
				return false;
			}
		}
		if (st.type === 'alter_table_alter_column_set_notnull') {
			if (
				jsonStatements.find(
					(it) =>
						it.type === 'alter_table_alter_column_set_identity'
						&& it.tableName === st.tableName
						&& it.schema === st.schema,
				)
			) {
				return false;
			}
		}
		return true;
	});

	const sqlStatements = fromJson(filteredJsonStatements, 'postgresql');

	const uniqueSqlStatements: string[] = [];
	sqlStatements.forEach((ss) => {
		if (!uniqueSqlStatements.includes(ss)) {
			uniqueSqlStatements.push(ss);
		}
	});

	const rSchemas = renamedSchemas.map((it) => ({
		from: it.from.name,
		to: it.to.name,
	}));

	const rTables = renamedTables.map((it) => {
		return { from: it.from, to: it.to };
	});

	const _meta = prepareMigrationMeta(rSchemas, rTables, rColumns);

	return {
		statements: filteredJsonStatements,
		sqlStatements: uniqueSqlStatements,
		_meta,
	};
};

export const applyMysqlSnapshotsDiff = async (
	json1: MySqlSchemaSquashed,
	json2: MySqlSchemaSquashed,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	prevFull: MySqlSchema,
	curFull: MySqlSchema,
	action?: 'push' | undefined,
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	_meta:
		| {
			schemas: {};
			tables: {};
			columns: {};
		}
		| undefined;
}> => {
	// squash indexes and fks

	// squash uniqueIndexes and uniqueConstraint into constraints object
	// it should be done for mysql only because it has no diffs for it

	// TODO: @AndriiSherman
	// Add an upgrade to v6 and move all snaphosts to this strcutre
	// After that we can generate mysql in 1 object directly(same as sqlite)
	for (const tableName in json1.tables) {
		const table = json1.tables[tableName];
		for (const indexName in table.indexes) {
			const index = MySqlSquasher.unsquashIdx(table.indexes[indexName]);
			if (index.isUnique) {
				table.uniqueConstraints[indexName] = MySqlSquasher.squashUnique({
					name: index.name,
					columns: index.columns,
				});
				delete json1.tables[tableName].indexes[index.name];
			}
		}
	}

	for (const tableName in json2.tables) {
		const table = json2.tables[tableName];
		for (const indexName in table.indexes) {
			const index = MySqlSquasher.unsquashIdx(table.indexes[indexName]);
			if (index.isUnique) {
				table.uniqueConstraints[indexName] = MySqlSquasher.squashUnique({
					name: index.name,
					columns: index.columns,
				});
				delete json2.tables[tableName].indexes[index.name];
			}
		}
	}

	const tablesDiff = diffSchemasOrTables(json1.tables, json2.tables);

	const {
		created: createdTables,
		deleted: deletedTables,
		renamed: renamedTables, // renamed or moved
	} = await tablesResolver({
		created: tablesDiff.added,
		deleted: tablesDiff.deleted,
	});

	const tablesPatchedSnap1 = copy(json1);
	tablesPatchedSnap1.tables = mapEntries(tablesPatchedSnap1.tables, (_, it) => {
		const { name } = nameChangeFor(it, renamedTables);
		it.name = name;
		return [name, it];
	});

	const res = diffColumns(tablesPatchedSnap1.tables, json2.tables);
	const columnRenames = [] as {
		table: string;
		renames: { from: Column; to: Column }[];
	}[];

	const columnCreates = [] as {
		table: string;
		columns: Column[];
	}[];

	const columnDeletes = [] as {
		table: string;
		columns: Column[];
	}[];

	for (let entry of Object.values(res)) {
		const { renamed, created, deleted } = await columnsResolver({
			tableName: entry.name,
			schema: entry.schema,
			deleted: entry.columns.deleted,
			created: entry.columns.added,
		});

		if (created.length > 0) {
			columnCreates.push({
				table: entry.name,
				columns: created,
			});
		}

		if (deleted.length > 0) {
			columnDeletes.push({
				table: entry.name,
				columns: deleted,
			});
		}

		if (renamed.length > 0) {
			columnRenames.push({
				table: entry.name,
				renames: renamed,
			});
		}
	}

	const columnRenamesDict = columnRenames.reduce(
		(acc, it) => {
			acc[it.table] = it.renames;
			return acc;
		},
		{} as Record<
			string,
			{
				from: Named;
				to: Named;
			}[]
		>,
	);

	const columnsPatchedSnap1 = copy(tablesPatchedSnap1);
	columnsPatchedSnap1.tables = mapEntries(
		columnsPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedColumns = mapKeys(
				tableValue.columns,
				(columnKey, column) => {
					const rens = columnRenamesDict[tableValue.name] || [];
					const newName = columnChangeFor(columnKey, rens);
					column.name = newName;
					return newName;
				},
			);

			tableValue.columns = patchedColumns;
			return [tableKey, tableValue];
		},
	);

	const diffResult = applyJsonDiff(columnsPatchedSnap1, json2);

	const typedResult: DiffResultMysql = diffResultSchemeMysql.parse(diffResult);

	const jsonStatements: JsonStatement[] = [];

	const jsonCreateIndexesForCreatedTables = createdTables
		.map((it) => {
			return prepareCreateIndexesJson(
				it.name,
				it.schema,
				it.indexes,
				curFull.internal,
			);
		})
		.flat();

	const jsonDropTables = deletedTables.map((it) => {
		return prepareDropTableJson(it);
	});

	const jsonRenameTables = renamedTables.map((it) => {
		return prepareRenameTableJson(it.from, it.to);
	});

	const alteredTables = typedResult.alteredTablesWithColumns;

	const jsonAddedCompositePKs: JsonCreateCompositePK[] = [];
	const jsonDeletedCompositePKs: JsonDeleteCompositePK[] = [];
	const jsonAlteredCompositePKs: JsonAlterCompositePK[] = [];

	const jsonAddedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
	const jsonDeletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
	const jsonAlteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

	const jsonRenameColumnsStatements: JsonRenameColumnStatement[] = columnRenames
		.map((it) => prepareRenameColumns(it.table, '', it.renames))
		.flat();

	const jsonAddColumnsStatemets: JsonAddColumnStatement[] = columnCreates
		.map((it) => _prepareAddColumns(it.table, '', it.columns))
		.flat();

	const jsonDropColumnsStatemets: JsonDropColumnStatement[] = columnDeletes
		.map((it) => _prepareDropColumns(it.table, '', it.columns))
		.flat();

	alteredTables.forEach((it) => {
		// This part is needed to make sure that same columns in a table are not triggered for change
		// there is a case where orm and kit are responsible for pk name generation and one of them is not sorting name
		// We double-check that pk with same set of columns are both in added and deleted diffs
		let addedColumns: string[] = [];
		for (const addedPkName of Object.keys(it.addedCompositePKs)) {
			const addedPkColumns = it.addedCompositePKs[addedPkName];
			addedColumns = MySqlSquasher.unsquashPK(addedPkColumns).columns;
		}

		let deletedColumns: string[] = [];
		for (const deletedPkName of Object.keys(it.deletedCompositePKs)) {
			const deletedPkColumns = it.deletedCompositePKs[deletedPkName];
			deletedColumns = MySqlSquasher.unsquashPK(deletedPkColumns).columns;
		}

		// Don't need to sort, but need to add tests for it
		// addedColumns.sort();
		// deletedColumns.sort();
		const doPerformDeleteAndCreate = JSON.stringify(addedColumns) !== JSON.stringify(deletedColumns);

		let addedCompositePKs: JsonCreateCompositePK[] = [];
		let deletedCompositePKs: JsonDeleteCompositePK[] = [];
		let alteredCompositePKs: JsonAlterCompositePK[] = [];

		addedCompositePKs = prepareAddCompositePrimaryKeyMySql(
			it.name,
			it.addedCompositePKs,
			prevFull,
			curFull,
		);
		deletedCompositePKs = prepareDeleteCompositePrimaryKeyMySql(
			it.name,
			it.deletedCompositePKs,
			prevFull,
		);
		// }
		alteredCompositePKs = prepareAlterCompositePrimaryKeyMySql(
			it.name,
			it.alteredCompositePKs,
			prevFull,
			curFull,
		);

		// add logic for unique constraints
		let addedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
		let deletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
		let alteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

		addedUniqueConstraints = prepareAddUniqueConstraint(
			it.name,
			it.schema,
			it.addedUniqueConstraints,
		);
		deletedUniqueConstraints = prepareDeleteUniqueConstraint(
			it.name,
			it.schema,
			it.deletedUniqueConstraints,
		);
		if (it.alteredUniqueConstraints) {
			const added: Record<string, string> = {};
			const deleted: Record<string, string> = {};
			for (const k of Object.keys(it.alteredUniqueConstraints)) {
				added[k] = it.alteredUniqueConstraints[k].__new;
				deleted[k] = it.alteredUniqueConstraints[k].__old;
			}
			addedUniqueConstraints.push(
				...prepareAddUniqueConstraint(it.name, it.schema, added),
			);
			deletedUniqueConstraints.push(
				...prepareDeleteUniqueConstraint(it.name, it.schema, deleted),
			);
		}

		jsonAddedCompositePKs.push(...addedCompositePKs);
		jsonDeletedCompositePKs.push(...deletedCompositePKs);
		jsonAlteredCompositePKs.push(...alteredCompositePKs);

		jsonAddedUniqueConstraints.push(...addedUniqueConstraints);
		jsonDeletedUniqueConstraints.push(...deletedUniqueConstraints);
		jsonAlteredUniqueConstraints.push(...alteredUniqueConstraints);
	});

	const rColumns = jsonRenameColumnsStatements.map((it) => {
		const tableName = it.tableName;
		const schema = it.schema;
		return {
			from: { schema, table: tableName, column: it.oldColumnName },
			to: { schema, table: tableName, column: it.newColumnName },
		};
	});

	const jsonTableAlternations = alteredTables
		.map((it) => {
			return prepareAlterColumnsMysql(
				it.name,
				it.schema,
				it.altered,
				json1,
				json2,
				action,
			);
		})
		.flat();

	const jsonCreateIndexesForAllAlteredTables = alteredTables
		.map((it) => {
			return prepareCreateIndexesJson(
				it.name,
				it.schema,
				it.addedIndexes || {},
				curFull.internal,
			);
		})
		.flat();

	const jsonDropIndexesForAllAlteredTables = alteredTables
		.map((it) => {
			return prepareDropIndexesJson(
				it.name,
				it.schema,
				it.deletedIndexes || {},
			);
		})
		.flat();

	alteredTables.forEach((it) => {
		const droppedIndexes = Object.keys(it.alteredIndexes).reduce(
			(current, item: string) => {
				current[item] = it.alteredIndexes[item].__old;
				return current;
			},
			{} as Record<string, string>,
		);
		const createdIndexes = Object.keys(it.alteredIndexes).reduce(
			(current, item: string) => {
				current[item] = it.alteredIndexes[item].__new;
				return current;
			},
			{} as Record<string, string>,
		);

		jsonCreateIndexesForAllAlteredTables.push(
			...prepareCreateIndexesJson(it.name, it.schema, createdIndexes || {}),
		);
		jsonDropIndexesForAllAlteredTables.push(
			...prepareDropIndexesJson(it.name, it.schema, droppedIndexes || {}),
		);
	});

	const jsonCreateReferencesForCreatedTables: JsonCreateReferenceStatement[] = createdTables
		.map((it) => {
			return prepareCreateReferencesJson(it.name, it.schema, it.foreignKeys);
		})
		.flat();

	const jsonReferencesForAllAlteredTables: JsonReferenceStatement[] = alteredTables
		.map((it) => {
			const forAdded = prepareCreateReferencesJson(
				it.name,
				it.schema,
				it.addedForeignKeys,
			);

			const forAltered = prepareDropReferencesJson(
				it.name,
				it.schema,
				it.deletedForeignKeys,
			);

			const alteredFKs = prepareAlterReferencesJson(
				it.name,
				it.schema,
				it.alteredForeignKeys,
			);

			return [...forAdded, ...forAltered, ...alteredFKs];
		})
		.flat();

	const jsonCreatedReferencesForAlteredTables = jsonReferencesForAllAlteredTables.filter(
		(t) => t.type === 'create_reference',
	);
	const jsonDroppedReferencesForAlteredTables = jsonReferencesForAllAlteredTables.filter(
		(t) => t.type === 'delete_reference',
	);

	const jsonMySqlCreateTables = createdTables.map((it) => {
		return prepareMySqlCreateTableJson(
			it,
			curFull as MySqlSchema,
			curFull.internal,
		);
	});
	jsonStatements.push(...jsonMySqlCreateTables);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDeletedUniqueConstraints);

	jsonStatements.push(...jsonDroppedReferencesForAlteredTables);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDeletedCompositePKs);
	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);

	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonDeletedUniqueConstraints);

	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonCreateReferencesForCreatedTables);
	jsonStatements.push(...jsonCreateIndexesForCreatedTables);

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);
	jsonStatements.push(...jsonCreateIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	// jsonStatements.push(...jsonDeletedCompositePKs);
	// jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonAddedUniqueConstraints);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	const sqlStatements = fromJson(jsonStatements, 'mysql');

	const uniqueSqlStatements: string[] = [];
	sqlStatements.forEach((ss) => {
		if (!uniqueSqlStatements.includes(ss)) {
			uniqueSqlStatements.push(ss);
		}
	});

	const rTables = renamedTables.map((it) => {
		return { from: it.from, to: it.to };
	});

	const _meta = prepareMigrationMeta([], rTables, rColumns);

	return {
		statements: jsonStatements,
		sqlStatements: uniqueSqlStatements,
		_meta,
	};
};

export const applySqliteSnapshotsDiff = async (
	json1: SQLiteSchemaSquashed,
	json2: SQLiteSchemaSquashed,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	prevFull: SQLiteSchema,
	curFull: SQLiteSchema,
	action?: 'push' | undefined,
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	_meta:
		| {
			schemas: {};
			tables: {};
			columns: {};
		}
		| undefined;
}> => {
	const tablesDiff = diffSchemasOrTables(json1.tables, json2.tables);

	const {
		created: createdTables,
		deleted: deletedTables,
		renamed: renamedTables,
	} = await tablesResolver({
		created: tablesDiff.added,
		deleted: tablesDiff.deleted,
	});

	const tablesPatchedSnap1 = copy(json1);
	tablesPatchedSnap1.tables = mapEntries(tablesPatchedSnap1.tables, (_, it) => {
		const { name } = nameChangeFor(it, renamedTables);
		it.name = name;
		return [name, it];
	});

	const res = diffColumns(tablesPatchedSnap1.tables, json2.tables);

	const columnRenames = [] as {
		table: string;
		renames: { from: Column; to: Column }[];
	}[];

	const columnCreates = [] as {
		table: string;
		columns: Column[];
	}[];

	const columnDeletes = [] as {
		table: string;
		columns: Column[];
	}[];

	for (let entry of Object.values(res)) {
		const { renamed, created, deleted } = await columnsResolver({
			tableName: entry.name,
			schema: entry.schema,
			deleted: entry.columns.deleted,
			created: entry.columns.added,
		});

		if (created.length > 0) {
			columnCreates.push({
				table: entry.name,
				columns: created,
			});
		}

		if (deleted.length > 0) {
			columnDeletes.push({
				table: entry.name,
				columns: deleted,
			});
		}

		if (renamed.length > 0) {
			columnRenames.push({
				table: entry.name,
				renames: renamed,
			});
		}
	}

	const columnRenamesDict = columnRenames.reduce(
		(acc, it) => {
			acc[it.table] = it.renames;
			return acc;
		},
		{} as Record<
			string,
			{
				from: Named;
				to: Named;
			}[]
		>,
	);

	const columnsPatchedSnap1 = copy(tablesPatchedSnap1);
	columnsPatchedSnap1.tables = mapEntries(
		columnsPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedColumns = mapKeys(
				tableValue.columns,
				(columnKey, column) => {
					const rens = columnRenamesDict[tableValue.name] || [];
					const newName = columnChangeFor(columnKey, rens);
					column.name = newName;
					return newName;
				},
			);

			tableValue.columns = patchedColumns;
			return [tableKey, tableValue];
		},
	);

	const diffResult = applyJsonDiff(columnsPatchedSnap1, json2);

	const typedResult = diffResultSchemeSQLite.parse(diffResult);

	// Map array of objects to map
	const tablesMap: {
		[key: string]: (typeof typedResult.alteredTablesWithColumns)[number];
	} = {};

	typedResult.alteredTablesWithColumns.forEach((obj) => {
		tablesMap[obj.name] = obj;
	});

	const jsonCreateTables = createdTables.map((it) => {
		return prepareSQLiteCreateTable(it, action);
	});

	const jsonCreateIndexesForCreatedTables = createdTables
		.map((it) => {
			return prepareCreateIndexesJson(
				it.name,
				it.schema,
				it.indexes,
				curFull.internal,
			);
		})
		.flat();

	const jsonDropTables = deletedTables.map((it) => {
		return prepareDropTableJson(it);
	});

	const jsonRenameTables = renamedTables.map((it) => {
		return prepareRenameTableJson(it.from, it.to);
	});

	const jsonRenameColumnsStatements: JsonRenameColumnStatement[] = columnRenames
		.map((it) => prepareRenameColumns(it.table, '', it.renames))
		.flat();

	const jsonDropColumnsStatemets: JsonDropColumnStatement[] = columnDeletes
		.map((it) => _prepareDropColumns(it.table, '', it.columns))
		.flat();

	const jsonAddColumnsStatemets: JsonSqliteAddColumnStatement[] = columnCreates
		.map((it) => {
			return _prepareSqliteAddColumns(
				it.table,
				it.columns,
				tablesMap[it.table] && tablesMap[it.table].addedForeignKeys
					? Object.values(tablesMap[it.table].addedForeignKeys)
					: [],
			);
		})
		.flat();

	const allAltered = typedResult.alteredTablesWithColumns;

	const jsonAddedCompositePKs: JsonCreateCompositePK[] = [];
	const jsonDeletedCompositePKs: JsonDeleteCompositePK[] = [];
	const jsonAlteredCompositePKs: JsonAlterCompositePK[] = [];

	const jsonAddedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
	const jsonDeletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
	const jsonAlteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

	allAltered.forEach((it) => {
		// This part is needed to make sure that same columns in a table are not triggered for change
		// there is a case where orm and kit are responsible for pk name generation and one of them is not sorting name
		// We double-check that pk with same set of columns are both in added and deleted diffs
		let addedColumns: string[] = [];
		for (const addedPkName of Object.keys(it.addedCompositePKs)) {
			const addedPkColumns = it.addedCompositePKs[addedPkName];
			addedColumns = SQLiteSquasher.unsquashPK(addedPkColumns);
		}

		let deletedColumns: string[] = [];
		for (const deletedPkName of Object.keys(it.deletedCompositePKs)) {
			const deletedPkColumns = it.deletedCompositePKs[deletedPkName];
			deletedColumns = SQLiteSquasher.unsquashPK(deletedPkColumns);
		}

		// Don't need to sort, but need to add tests for it
		// addedColumns.sort();
		// deletedColumns.sort();

		const doPerformDeleteAndCreate = JSON.stringify(addedColumns) !== JSON.stringify(deletedColumns);

		let addedCompositePKs: JsonCreateCompositePK[] = [];
		let deletedCompositePKs: JsonDeleteCompositePK[] = [];
		let alteredCompositePKs: JsonAlterCompositePK[] = [];
		if (doPerformDeleteAndCreate) {
			addedCompositePKs = prepareAddCompositePrimaryKeySqlite(
				it.name,
				it.addedCompositePKs,
			);
			deletedCompositePKs = prepareDeleteCompositePrimaryKeySqlite(
				it.name,
				it.deletedCompositePKs,
			);
		}
		alteredCompositePKs = prepareAlterCompositePrimaryKeySqlite(
			it.name,
			it.alteredCompositePKs,
		);

		// add logic for unique constraints
		let addedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
		let deletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
		let alteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

		addedUniqueConstraints = prepareAddUniqueConstraint(
			it.name,
			it.schema,
			it.addedUniqueConstraints,
		);
		deletedUniqueConstraints = prepareDeleteUniqueConstraint(
			it.name,
			it.schema,
			it.deletedUniqueConstraints,
		);
		if (it.alteredUniqueConstraints) {
			const added: Record<string, string> = {};
			const deleted: Record<string, string> = {};
			for (const k of Object.keys(it.alteredUniqueConstraints)) {
				added[k] = it.alteredUniqueConstraints[k].__new;
				deleted[k] = it.alteredUniqueConstraints[k].__old;
			}
			addedUniqueConstraints.push(
				...prepareAddUniqueConstraint(it.name, it.schema, added),
			);
			deletedUniqueConstraints.push(
				...prepareDeleteUniqueConstraint(it.name, it.schema, deleted),
			);
		}

		jsonAddedCompositePKs.push(...addedCompositePKs);
		jsonDeletedCompositePKs.push(...deletedCompositePKs);
		jsonAlteredCompositePKs.push(...alteredCompositePKs);

		jsonAddedUniqueConstraints.push(...addedUniqueConstraints);
		jsonDeletedUniqueConstraints.push(...deletedUniqueConstraints);
		jsonAlteredUniqueConstraints.push(...alteredUniqueConstraints);
	});

	const rColumns = jsonRenameColumnsStatements.map((it) => {
		const tableName = it.tableName;
		const schema = it.schema;
		return {
			from: { schema, table: tableName, column: it.oldColumnName },
			to: { schema, table: tableName, column: it.newColumnName },
		};
	});

	const jsonTableAlternations = allAltered
		.map((it) => {
			return prepareSqliteAlterColumns(it.name, it.schema, it.altered, json2);
		})
		.flat();

	const jsonCreateIndexesForAllAlteredTables = allAltered
		.map((it) => {
			return prepareCreateIndexesJson(
				it.name,
				it.schema,
				it.addedIndexes || {},
				curFull.internal,
			);
		})
		.flat();

	const jsonDropIndexesForAllAlteredTables = allAltered
		.map((it) => {
			return prepareDropIndexesJson(
				it.name,
				it.schema,
				it.deletedIndexes || {},
			);
		})
		.flat();

	allAltered.forEach((it) => {
		const droppedIndexes = Object.keys(it.alteredIndexes).reduce(
			(current, item: string) => {
				current[item] = it.alteredIndexes[item].__old;
				return current;
			},
			{} as Record<string, string>,
		);
		const createdIndexes = Object.keys(it.alteredIndexes).reduce(
			(current, item: string) => {
				current[item] = it.alteredIndexes[item].__new;
				return current;
			},
			{} as Record<string, string>,
		);

		jsonCreateIndexesForAllAlteredTables.push(
			...prepareCreateIndexesJson(
				it.name,
				it.schema,
				createdIndexes || {},
				curFull.internal,
			),
		);
		jsonDropIndexesForAllAlteredTables.push(
			...prepareDropIndexesJson(it.name, it.schema, droppedIndexes || {}),
		);
	});

	const jsonReferencesForAllAlteredTables: JsonReferenceStatement[] = allAltered
		.map((it) => {
			const forAdded = prepareCreateReferencesJson(
				it.name,
				it.schema,
				it.addedForeignKeys,
			);

			const forAltered = prepareDropReferencesJson(
				it.name,
				it.schema,
				it.deletedForeignKeys,
			);

			const alteredFKs = prepareAlterReferencesJson(
				it.name,
				it.schema,
				it.alteredForeignKeys,
			);

			return [...forAdded, ...forAltered, ...alteredFKs];
		})
		.flat();

	const jsonCreatedReferencesForAlteredTables = jsonReferencesForAllAlteredTables.filter(
		(t) => t.type === 'create_reference',
	);
	const jsonDroppedReferencesForAlteredTables = jsonReferencesForAllAlteredTables.filter(
		(t) => t.type === 'delete_reference',
	);

	const jsonStatements: JsonStatement[] = [];
	jsonStatements.push(...jsonCreateTables);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDroppedReferencesForAlteredTables);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDeletedCompositePKs);
	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonCreateIndexesForCreatedTables);
	jsonStatements.push(...jsonCreateIndexesForAllAlteredTables);

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	// jsonStatements.push(...jsonDeletedCompositePKs);
	// jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	const sqlStatements = fromJson(jsonStatements, 'sqlite');

	const uniqueSqlStatements: string[] = [];
	sqlStatements.forEach((ss) => {
		if (!uniqueSqlStatements.includes(ss)) {
			uniqueSqlStatements.push(ss);
		}
	});

	const rTables = renamedTables.map((it) => {
		return { from: it.from, to: it.to };
	});

	const _meta = prepareMigrationMeta([], rTables, rColumns);

	return {
		statements: jsonStatements,
		sqlStatements: uniqueSqlStatements,
		_meta,
	};
};

// explicitely ask if tables were renamed, if yes - add those to altered tables, otherwise - deleted
// double check if user wants to delete particular table and warn him on data loss
