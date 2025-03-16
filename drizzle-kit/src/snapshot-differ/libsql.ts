import { applyJsonDiff, diffColumns, diffSchemasOrTables } from '../jsonDiffer';
import { fromJson } from '../sqlgenerator';

import { View } from 'src/dialects/sqlite/ddl';
import { mapEntries, mapKeys } from '../global';
import {
	_prepareAddColumns,
	_prepareDropColumns,
	_prepareSqliteAddColumns,
	JsonAlterCompositePK,
	JsonAlterUniqueConstraint,
	JsonCreateCheckConstraint,
	JsonCreateCompositePK,
	JsonCreateUniqueConstraint,
	JsonDeleteCheckConstraint,
	JsonDeleteCompositePK,
	JsonDeleteUniqueConstraint,
	JsonDropColumnStatement,
	JsonDropViewStatement,
	JsonReferenceStatement,
	JsonRenameColumnStatement,
	JsonStatement,
	prepareAddCheckConstraint,
	prepareAddUniqueConstraintPg as prepareAddUniqueConstraint,
	prepareAlterReferencesJson,
	prepareCreateIndexesJson,
	prepareDeleteCheckConstraint,
	prepareDeleteUniqueConstraintPg as prepareDeleteUniqueConstraint,
	prepareDropIndexesJson,
	prepareDropTableJson,
	prepareDropViewJson,
	prepareRenameColumns,
	prepareRenameTableJson,
} from '../jsonStatements';
import { copy, prepareMigrationMeta } from '../utils';
import {
	Column,
	ColumnsResolverInput,
	ColumnsResolverOutput,
	ResolverInput,
	ResolverOutputWithMoved,
	Table,
} from './common';

export const applyLibSQLSnapshotsDiff = async (
	json1: SQLiteSchemaSquashed,
	json2: SQLiteSchemaSquashed,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	viewsResolver: (
		input: ResolverInput<View & { schema: '' }>,
	) => Promise<ResolverOutputWithMoved<View>>,
	prevFull: SQLiteSchema,
	curFull: SQLiteSchema,
	action?: 'push',
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

	const viewsDiff = diffSchemasOrTables(json1.views, json2.views);

	const {
		created: createdViews,
		deleted: deletedViews,
		renamed: renamedViews, // renamed or moved
	} = await viewsResolver({
		created: viewsDiff.added,
		deleted: viewsDiff.deleted,
	});

	const renamesViewDic: Record<string, { to: string; from: string }> = {};
	renamedViews.forEach((it) => {
		renamesViewDic[it.from.name] = { to: it.to.name, from: it.from.name };
	});

	const viewsPatchedSnap1 = copy(columnsPatchedSnap1);
	viewsPatchedSnap1.views = mapEntries(
		viewsPatchedSnap1.views,
		(viewKey, viewValue) => {
			const rename = renamesViewDic[viewValue.name];

			if (rename) {
				viewValue.name = rename.to;
			}

			return [viewKey, viewValue];
		},
	);

	const diffResult = applyJsonDiff(viewsPatchedSnap1, json2);

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

	const rColumns = jsonRenameColumnsStatements.map((it) => {
		const tableName = it.tableName;
		const schema = it.schema;
		return {
			from: { schema, table: tableName, column: it.oldColumnName },
			to: { schema, table: tableName, column: it.newColumnName },
		};
	});

	const rTables = renamedTables.map((it) => {
		return { from: it.from, to: it.to };
	});

	const _meta = prepareMigrationMeta([], rTables, rColumns);

	const allAltered = typedResult.alteredTablesWithColumns;

	const jsonAddedCompositePKs: JsonCreateCompositePK[] = [];
	const jsonDeletedCompositePKs: JsonDeleteCompositePK[] = [];
	const jsonAlteredCompositePKs: JsonAlterCompositePK[] = [];

	const jsonAddedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
	const jsonDeletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
	const jsonAlteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];

	const jsonDeletedCheckConstraints: JsonDeleteCheckConstraint[] = [];
	const jsonCreatedCheckConstraints: JsonCreateCheckConstraint[] = [];

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

		let createdCheckConstraints: JsonCreateCheckConstraint[] = [];
		let deletedCheckConstraints: JsonDeleteCheckConstraint[] = [];

		addedUniqueConstraints = prepareAddUniqueConstraint(
			it.name,
			it.schema,
			Object.values(it.addedUniqueConstraints),
		);

		deletedUniqueConstraints = prepareDeleteUniqueConstraint(
			it.name,
			it.schema,
			Object.values(it.deletedUniqueConstraints),
		);
		if (it.alteredUniqueConstraints) {
			const added: Record<string, string> = {};
			const deleted: Record<string, string> = {};
			for (const k of Object.keys(it.alteredUniqueConstraints)) {
				added[k] = it.alteredUniqueConstraints[k].__new;
				deleted[k] = it.alteredUniqueConstraints[k].__old;
			}
			addedUniqueConstraints.push(
				...prepareAddUniqueConstraint(it.name, it.schema, Object.values(added)),
			);
			deletedUniqueConstraints.push(
				...prepareDeleteUniqueConstraint(it.name, it.schema, Object.values(deleted)),
			);
		}

		createdCheckConstraints = prepareAddCheckConstraint(it.name, it.schema, it.addedCheckConstraints);
		deletedCheckConstraints = prepareDeleteCheckConstraint(
			it.name,
			it.schema,
			it.deletedCheckConstraints,
		);

		// skip for push
		if (it.alteredCheckConstraints && action !== 'push') {
			const added: Record<string, string> = {};
			const deleted: Record<string, string> = {};

			for (const k of Object.keys(it.alteredCheckConstraints)) {
				added[k] = it.alteredCheckConstraints[k].__new;
				deleted[k] = it.alteredCheckConstraints[k].__old;
			}
			createdCheckConstraints.push(...prepareAddCheckConstraint(it.name, it.schema, added));
			deletedCheckConstraints.push(...prepareDeleteCheckConstraint(it.name, it.schema, deleted));
		}

		jsonAddedCompositePKs.push(...addedCompositePKs);
		jsonDeletedCompositePKs.push(...deletedCompositePKs);
		jsonAlteredCompositePKs.push(...alteredCompositePKs);

		jsonAddedUniqueConstraints.push(...addedUniqueConstraints);
		jsonDeletedUniqueConstraints.push(...deletedUniqueConstraints);
		jsonAlteredUniqueConstraints.push(...alteredUniqueConstraints);

		jsonCreatedCheckConstraints.push(...createdCheckConstraints);
		jsonDeletedCheckConstraints.push(...deletedCheckConstraints);
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
				Object.values(it.deletedIndexes),
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
			...prepareDropIndexesJson(it.name, it.schema, Object.values(droppedIndexes)),
		);
	});

	const jsonReferencesForAllAlteredTables: JsonReferenceStatement[] = allAltered
		.map((it) => {
			const forAdded = prepareLibSQLCreateReferencesJson(
				it.name,
				it.schema,
				it.addedForeignKeys,
				json2,
				action,
			);

			const forAltered = prepareLibSQLDropReferencesJson(
				it.name,
				it.schema,
				it.deletedForeignKeys,
				json2,
				_meta,
				action,
			);

			const alteredFKs = prepareAlterReferencesJson(it.name, it.schema, it.alteredForeignKeys);

			return [...forAdded, ...forAltered, ...alteredFKs];
		})
		.flat();

	const jsonCreatedReferencesForAlteredTables = jsonReferencesForAllAlteredTables.filter(
		(t) => t.type === 'create_reference',
	);
	const jsonDroppedReferencesForAlteredTables = jsonReferencesForAllAlteredTables.filter(
		(t) => t.type === 'delete_reference',
	);

	const createViews: JsonCreateSqliteViewStatement[] = [];
	const dropViews: JsonDropViewStatement[] = [];

	createViews.push(
		...createdViews.filter((it) => !it.isExisting).map((it) => {
			return prepareSqliteCreateViewJson(
				it.name,
				it.definition!,
			);
		}),
	);

	dropViews.push(
		...deletedViews.filter((it) => !it.isExisting).map((it) => {
			return prepareDropViewJson(it.name);
		}),
	);

	// renames
	dropViews.push(
		...renamedViews.filter((it) => !it.to.isExisting).map((it) => {
			return prepareDropViewJson(it.from.name);
		}),
	);
	createViews.push(
		...renamedViews.filter((it) => !it.to.isExisting).map((it) => {
			return prepareSqliteCreateViewJson(it.to.name, it.to.definition!);
		}),
	);

	const alteredViews = typedResult.alteredViews.filter((it) => !json2.views[it.name].isExisting);

	for (const alteredView of alteredViews) {
		const { definition } = json2.views[alteredView.name];

		if (alteredView.alteredExisting || (alteredView.alteredDefinition && action !== 'push')) {
			dropViews.push(prepareDropViewJson(alteredView.name));

			createViews.push(
				prepareSqliteCreateViewJson(
					alteredView.name,
					definition!,
				),
			);
		}
	}

	const jsonStatements: JsonStatement[] = [];
	jsonStatements.push(...jsonCreateTables);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDroppedReferencesForAlteredTables);

	jsonStatements.push(...jsonDeletedCheckConstraints);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDeletedCompositePKs);
	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonCreateIndexesForCreatedTables);
	jsonStatements.push(...jsonCreateIndexesForAllAlteredTables);
	jsonStatements.push(...jsonCreatedCheckConstraints);

	jsonStatements.push(...dropViews);
	jsonStatements.push(...createViews);

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	const combinedJsonStatements = libSQLCombineStatements(jsonStatements, json2, action);

	const { sqlStatements } = fromJson(
		combinedJsonStatements,
		'turso',
		action,
		json2,
	);

	return {
		statements: combinedJsonStatements,
		sqlStatements,
		_meta,
	};
};
