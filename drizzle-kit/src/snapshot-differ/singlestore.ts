import { applyJsonDiff, diffColumns, diffSchemasOrTables } from '../jsonDiffer';
import { fromJson } from '../sqlgenerator';

import { columnChangeFor, nameChangeFor, Named } from '../ddl';
import { mapEntries, mapKeys } from '../global';
import {
	_prepareAddColumns,
	_prepareDropColumns,
	_prepareSqliteAddColumns,
	JsonAddColumnStatement,
	JsonAlterUniqueConstraint,
	JsonCreateCheckConstraint,
	JsonCreateCompositePK,
	JsonCreateUniqueConstraint,
	JsonDeleteCheckConstraint,
	JsonDeleteUniqueConstraint,
	JsonDropColumnStatement,
	JsonRenameColumnStatement,
	JsonStatement,
	prepareAddCheckConstraint,
	prepareAddUniqueConstraintPg as prepareAddUniqueConstraint,
	prepareAlterColumnsMysql,
	prepareCreateIndexesJson,
	prepareDeleteCheckConstraint,
	prepareDeleteUniqueConstraintPg as prepareDeleteUniqueConstraint,
	prepareDropIndexesJson,
	prepareDropTableJson,
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

export const applySingleStoreSnapshotsDiff = async (
	json1: SingleStoreSchemaSquashed,
	json2: SingleStoreSchemaSquashed,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	/* viewsResolver: (
		input: ResolverInput<ViewSquashed & { schema: '' }>,
	) => Promise<ResolverOutputWithMoved<ViewSquashed>>, */
	prevFull: SingleStoreSchema,
	curFull: SingleStoreSchema,
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
	// it should be done for singlestore only because it has no diffs for it

	// TODO: @AndriiSherman
	// Add an upgrade to v6 and move all snaphosts to this strcutre
	// After that we can generate singlestore in 1 object directly(same as sqlite)
	for (const tableName in json1.tables) {
		const table = json1.tables[tableName];
		for (const indexName in table.indexes) {
			const index = SingleStoreSquasher.unsquashIdx(table.indexes[indexName]);
			if (index.isUnique) {
				table.uniqueConstraints[indexName] = SingleStoreSquasher.squashUnique({
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
			const index = SingleStoreSquasher.unsquashIdx(table.indexes[indexName]);
			if (index.isUnique) {
				table.uniqueConstraints[indexName] = SingleStoreSquasher.squashUnique({
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

	/* const viewsDiff = diffSchemasOrTables(json1.views, json2.views);

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
				viewKey = rename.to;
			}

			return [viewKey, viewValue];
		},
	);

	*/
	const diffResult = applyJsonDiff(tablesPatchedSnap1, json2); // replace tablesPatchedSnap1 with viewsPatchedSnap1

	const typedResult: DiffResultSingleStore = diffResultSchemeSingleStore.parse(diffResult);

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
			addedColumns = SingleStoreSquasher.unsquashPK(addedPkColumns).columns;
		}

		let deletedColumns: string[] = [];
		for (const deletedPkName of Object.keys(it.deletedCompositePKs)) {
			const deletedPkColumns = it.deletedCompositePKs[deletedPkName];
			deletedColumns = SingleStoreSquasher.unsquashPK(deletedPkColumns).columns;
		}

		// Don't need to sort, but need to add tests for it
		// addedColumns.sort();
		// deletedColumns.sort();
		const doPerformDeleteAndCreate = JSON.stringify(addedColumns) !== JSON.stringify(deletedColumns);

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
				Object.values(it.deletedIndexes),
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
			...prepareDropIndexesJson(it.name, it.schema, Object.values(droppedIndexes)),
		);
	});

	const jsonSingleStoreCreateTables = createdTables.map((it) => {
		return prepareSingleStoreCreateTableJson(
			it,
			curFull as SingleStoreSchema,
			curFull.internal,
		);
	});

	/* const createViews: JsonCreateSingleStoreViewStatement[] = [];
	const dropViews: JsonDropViewStatement[] = [];
	const renameViews: JsonRenameViewStatement[] = [];
	const alterViews: JsonAlterSingleStoreViewStatement[] = [];

	createViews.push(
		...createdViews.filter((it) => !it.isExisting).map((it) => {
			return prepareSingleStoreCreateViewJson(
				it.name,
				it.definition!,
				it.meta,
			);
		}),
	);

	dropViews.push(
		...deletedViews.filter((it) => !it.isExisting).map((it) => {
			return prepareDropViewJson(it.name);
		}),
	);

	renameViews.push(
		...renamedViews.filter((it) => !it.to.isExisting && !json1.views[it.from.name].isExisting).map((it) => {
			return prepareRenameViewJson(it.to.name, it.from.name);
		}),
	);

	const alteredViews = typedResult.alteredViews.filter((it) => !json2.views[it.name].isExisting);

	for (const alteredView of alteredViews) {
		const { definition, meta } = json2.views[alteredView.name];

		if (alteredView.alteredExisting) {
			dropViews.push(prepareDropViewJson(alteredView.name));

			createViews.push(
				prepareSingleStoreCreateViewJson(
					alteredView.name,
					definition!,
					meta,
				),
			);

			continue;
		}

		if (alteredView.alteredDefinition && action !== 'push') {
			createViews.push(
				prepareSingleStoreCreateViewJson(
					alteredView.name,
					definition!,
					meta,
					true,
				),
			);
			continue;
		}

		if (alteredView.alteredMeta) {
			const view = curFull['views'][alteredView.name];
			alterViews.push(
				prepareSingleStoreAlterView(view),
			);
		}
	} */

	jsonStatements.push(...jsonSingleStoreCreateTables);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	/*jsonStatements.push(...createViews);
	jsonStatements.push(...dropViews);
	jsonStatements.push(...renameViews);
	jsonStatements.push(...alterViews);
 */
	jsonStatements.push(...jsonDeletedUniqueConstraints);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);

	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonDeletedUniqueConstraints);

	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonCreateIndexesForCreatedTables);

	jsonStatements.push(...jsonCreateIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	jsonStatements.push(...jsonAddedCompositePKs);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	const { sqlStatements } = fromJson(jsonStatements, 'singlestore');

	const rTables = renamedTables.map((it) => {
		return { from: it.from, to: it.to };
	});

	const _meta = prepareMigrationMeta([], rTables, rColumns);

	return {
		statements: jsonStatements,
		sqlStatements,
		_meta,
	};
};
