import { mapEntries, mapKeys } from '../global';
import { applyJsonDiff, diffColumns, diffSchemasOrTables } from '../jsonDiffer';
import type {
	JsonAlterCompositePK,
	JsonAlterUniqueConstraint,
	JsonCreateCheckConstraint,
	JsonCreateCompositePK,
	JsonCreateSqliteViewStatement,
	JsonCreateUniqueConstraint,
	JsonDeleteCheckConstraint,
	JsonDeleteCompositePK,
	JsonDeleteUniqueConstraint,
	JsonDropColumnStatement,
	JsonDropViewStatement,
	JsonReferenceStatement,
	JsonRenameColumnStatement,
	JsonSqliteAddColumnStatement,
	JsonStatement,
} from '../jsonStatements';
import {
	_prepareAddColumns,
	_prepareDropColumns,
	_prepareSqliteAddColumns,
	prepareAddCheckConstraint,
	prepareAddCompositePrimaryKeySqlite,
	prepareAddUniqueConstraintPg as prepareAddUniqueConstraint,
	prepareAlterCompositePrimaryKeySqlite,
	prepareAlterReferencesJson,
	prepareCreateIndexesJson,
	prepareCreateReferencesJson,
	prepareDeleteCheckConstraint,
	prepareDeleteCompositePrimaryKeySqlite,
	prepareDeleteUniqueConstraintPg as prepareDeleteUniqueConstraint,
	prepareDropIndexesJson,
	prepareDropReferencesJson,
	prepareDropTableJson,
	prepareDropViewJson,
	prepareRenameColumns,
	prepareRenameTableJson,
	prepareSqliteAlterColumns,
	prepareSQLiteCreateTable,
	prepareSqliteCreateViewJson,
	prepareSQLiteRecreateTable,
} from '../jsonStatements';
import { copy } from '../utils';

import { never, object } from 'zod';
import type {
	Column,
	ColumnsResolverInput,
	ColumnsResolverOutput,
	Named,
	ResolverInput,
	ResolverOutputWithMoved,
	Table,
} from '../snapshotsDiffer';
import {
	alteredTableScheme,
	alteredViewCommon,
	columnChangeFor,
	columnsResolver,
	nameChangeFor,
	sqliteViewsResolver,
	tablesResolver,
} from '../snapshotsDiffer';
import { fromJson } from '../sqlgenerator';
import {
	drySQLite,
	type SQLiteSchema,
	type SQLiteSchemaSquashed,
	SQLiteSquasher,
	squashSqliteScheme,
	type View as SqliteView,
} from './sqliteSchema';

export const diffResultSchemeSQLite = object({
	alteredTablesWithColumns: alteredTableScheme.array(),
	alteredEnums: never().array(),
	alteredViews: alteredViewCommon.array(),
});

export const sqliteCombineStatements = (
	statements: JsonStatement[],
	json2: SQLiteSchemaSquashed,
	action?: 'push',
) => {
	// const tablesContext: Record<string, string[]> = {};
	const newStatements: Record<string, JsonStatement[]> = {};
	for (const statement of statements) {
		if (
			statement.type === 'alter_table_alter_column_set_type'
			|| statement.type === 'alter_table_alter_column_set_default'
			|| statement.type === 'alter_table_alter_column_drop_default'
			|| statement.type === 'alter_table_alter_column_set_notnull'
			|| statement.type === 'alter_table_alter_column_drop_notnull'
			|| statement.type === 'alter_table_alter_column_drop_autoincrement'
			|| statement.type === 'alter_table_alter_column_set_autoincrement'
			|| statement.type === 'alter_table_alter_column_drop_pk'
			|| statement.type === 'alter_table_alter_column_set_pk'
			|| statement.type === 'delete_reference'
			|| statement.type === 'alter_reference'
			|| statement.type === 'create_composite_pk'
			|| statement.type === 'alter_composite_pk'
			|| statement.type === 'delete_composite_pk'
			|| statement.type === 'create_unique_constraint'
			|| statement.type === 'delete_unique_constraint'
			|| statement.type === 'create_check_constraint'
			|| statement.type === 'delete_check_constraint'
		) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSQLiteRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSQLiteRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (statement.type === 'sqlite_alter_table_add_column' && statement.column.primaryKey) {
			const tableName = statement.tableName;

			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSQLiteRecreateTable(json2.tables[tableName], action);
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSQLiteRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		if (statement.type === 'create_reference') {
			const tableName = statement.tableName;

			const data = action === 'push'
				? SQLiteSquasher.unsquashPushFK(statement.data)
				: SQLiteSquasher.unsquashFK(statement.data);
			const statementsForTable = newStatements[tableName];

			if (!statementsForTable) {
				newStatements[tableName] = prepareSQLiteRecreateTable(json2.tables[tableName], action);
				continue;
			}

			// if add column with reference -> skip create_reference statement
			if (
				data.columnsFrom.length === 1
				&& statementsForTable.some((st) =>
					st.type === 'sqlite_alter_table_add_column' && st.column.name === data.columnsFrom[0]
				)
			) {
				continue;
			}

			if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
				const wasRename = statementsForTable.some(({ type }) => type === 'rename_table');
				const preparedStatements = prepareSQLiteRecreateTable(json2.tables[tableName], action);

				if (wasRename) {
					newStatements[tableName].push(...preparedStatements);
				} else {
					newStatements[tableName] = preparedStatements;
				}

				continue;
			}

			continue;
		}

		const tableName = statement.type === 'rename_table'
			? statement.tableNameTo
			: (statement as { tableName: string }).tableName;

		const statementsForTable = newStatements[tableName];

		if (!statementsForTable) {
			newStatements[tableName] = [statement];
			continue;
		}

		if (!statementsForTable.some(({ type }) => type === 'recreate_table')) {
			newStatements[tableName].push(statement);
		}
	}

	const combinedStatements = Object.values(newStatements).flat();

	const renamedTables = combinedStatements.filter((it) => it.type === 'rename_table');
	const renamedColumns = combinedStatements.filter((it) => it.type === 'alter_table_rename_column');

	const rest = combinedStatements.filter((it) => it.type !== 'rename_table' && it.type !== 'alter_table_rename_column');

	return [...renamedTables, ...renamedColumns, ...rest];
};

export const diff = async (opts: {
	left?: SQLiteSchema;
	right: SQLiteSchema;
	mode?: 'push';
}) => {
	const left = opts.left ?? drySQLite;
	const json1 = squashSqliteScheme(left);
	const json2 = squashSqliteScheme(opts.right);
	return _diff(
		json1,
		json2,
		tablesResolver,
		columnsResolver,
		sqliteViewsResolver,
		left,
		opts.right,
		opts.mode,
	);
};

export const _diff = async (
	json1: SQLiteSchemaSquashed,
	json2: SQLiteSchemaSquashed,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	viewsResolver: (
		input: ResolverInput<SqliteView & { schema: '' }>,
	) => Promise<ResolverOutputWithMoved<SqliteView>>,
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

		let createdCheckConstraints: JsonCreateCheckConstraint[] = [];
		let deletedCheckConstraints: JsonDeleteCheckConstraint[] = [];

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

	// const rColumns = jsonRenameColumnsStatements.map((it) => {
	// 	const tableName = it.tableName;
	// 	const schema = it.schema;
	// 	return {
	// 		from: { schema, table: tableName, column: it.oldColumnName },
	// 		to: { schema, table: tableName, column: it.newColumnName },
	// 	};
	// });

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

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	// jsonStatements.push(...jsonDeletedCompositePKs);
	// jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	jsonStatements.push(...dropViews);
	jsonStatements.push(...createViews);

	const combinedJsonStatements = sqliteCombineStatements(jsonStatements, json2, action);
	const sqlStatements = fromJson(combinedJsonStatements, 'sqlite');

	const uniqueSqlStatements: string[] = [];
	sqlStatements.forEach((ss) => {
		if (!uniqueSqlStatements.includes(ss)) {
			uniqueSqlStatements.push(ss);
		}
	});

	// const rTables = renamedTables.map((it) => {
	// 	return { from: it.from, to: it.to };
	// });

	// const _meta = prepareMigrationMeta([], rTables, rColumns);

	return {
		statements: combinedJsonStatements,
		sqlStatements: uniqueSqlStatements,
		_meta: { columns: [], schemas: [], tables: [] },
	};
};
