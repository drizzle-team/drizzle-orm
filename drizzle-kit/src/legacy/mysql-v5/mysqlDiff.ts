import { applyJsonDiff, diffColumns, diffSchemasOrTables } from '../jsonDiffer';
import { fromJson } from '../sqlgenerator2';

import type {
	JsonAddColumnStatement,
	JsonAlterCompositePK,
	JsonAlterUniqueConstraint,
	JsonCreateCheckConstraint,
	JsonCreateCompositePK,
	JsonCreateMySqlViewStatement,
	JsonCreateReferenceStatement,
	JsonCreateUniqueConstraint,
	JsonDeleteCheckConstraint,
	JsonDeleteCompositePK,
	JsonDeleteUniqueConstraint,
	JsonDropColumnStatement,
	JsonDropViewStatement,
	JsonReferenceStatement,
	JsonRenameColumnStatement,
	JsonRenameViewStatement,
	JsonStatement,
} from '../jsonStatements';
import {
	_prepareAddColumns,
	_prepareDropColumns,
	prepareAddCheckConstraint,
	prepareAddCompositePrimaryKeyMySql,
	prepareAddUniqueConstraintPg as prepareAddUniqueConstraint,
	prepareAlterCompositePrimaryKeyMySql,
	prepareAlterReferencesJson,
	prepareCreateIndexesJson,
	prepareCreateReferencesJson,
	prepareDeleteCheckConstraint,
	prepareDeleteCompositePrimaryKeyMySql,
	prepareDeleteUniqueConstraintPg as prepareDeleteUniqueConstraint,
	prepareDropIndexesJson,
	prepareDropReferencesJson,
	prepareDropTableJson,
	prepareDropViewJson,
	prepareMySqlCreateTableJson,
	prepareMySqlCreateViewJson,
	prepareRenameColumns,
	prepareRenameTableJson,
	prepareRenameViewJson,
} from '../jsonStatements';

import { mapEntries, mapKeys } from '../global';
import type {
	Column,
	ColumnsResolverInput,
	ColumnsResolverOutput,
	DiffResultMysql,
	Named,
	ResolverInput,
	ResolverOutputWithMoved,
	Table,
} from '../snapshotsDiffer';
import {
	columnChangeFor,
	columnsResolver,
	diffResultSchemeMysql,
	mySqlViewsResolver,
	nameChangeFor,
	tablesResolver,
} from '../snapshotsDiffer';
import { copy } from '../utils';
import type { MySqlSchema, MySqlSchemaSquashed, ViewSquashed } from './mysqlSchema';
import { dryMySql, MySqlSquasher, squashMysqlScheme } from './mysqlSchema';

export const diff = async (opts: {
	left?: MySqlSchema;
	right: MySqlSchema;
	mode?: 'push';
}) => {
	const left = opts.left ?? dryMySql;
	const json1 = squashMysqlScheme(left);
	const json2 = squashMysqlScheme(opts.right);
	return _diff(
		json1,
		json2,
		tablesResolver,
		columnsResolver,
		mySqlViewsResolver,
		left,
		opts.right,
		opts.mode,
	);
};

export const _diff = async (
	json1: MySqlSchemaSquashed,
	json2: MySqlSchemaSquashed,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	viewsResolver: (
		input: ResolverInput<ViewSquashed & { schema: '' }>,
	) => Promise<ResolverOutputWithMoved<ViewSquashed>>,
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
				viewKey = rename.to;
			}

			return [viewKey, viewValue];
		},
	);

	const diffResult = applyJsonDiff(viewsPatchedSnap1, json2);

	const typedResult: DiffResultMysql = diffResultSchemeMysql.parse(diffResult);

	const jsonStatements: JsonStatement[] = [];

	const jsonCreateIndexesForCreatedTables = createdTables
		.map((it) => {
			return prepareCreateIndexesJson(
				it.name,
				it.schema,
				it.indexes,
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

	const jsonCreatedCheckConstraints: JsonCreateCheckConstraint[] = [];
	const jsonDeletedCheckConstraints: JsonDeleteCheckConstraint[] = [];

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
		// let addedColumns: string[] = [];
		// for (const addedPkName of Object.keys(it.addedCompositePKs)) {
		// 	const addedPkColumns = it.addedCompositePKs[addedPkName];
		// 	addedColumns = MySqlSquasher.unsquashPK(addedPkColumns).columns;
		// }

		// let deletedColumns: string[] = [];
		// for (const deletedPkName of Object.keys(it.deletedCompositePKs)) {
		// 	const deletedPkColumns = it.deletedCompositePKs[deletedPkName];
		// 	deletedColumns = MySqlSquasher.unsquashPK(deletedPkColumns).columns;
		// }

		// Don't need to sort, but need to add tests for it
		// addedColumns.sort();
		// deletedColumns.sort();
		// const doPerformDeleteAndCreate = JSON.stringify(addedColumns) !== JSON.stringify(deletedColumns);

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

	const jsonTableAlternations = alteredTables
		.map(() => {
			throw new Error('unexpected');
		})
		.flat();

	const jsonCreateIndexesForAllAlteredTables = alteredTables
		.map((it) => {
			return prepareCreateIndexesJson(
				it.name,
				it.schema,
				it.addedIndexes || {},
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
		);
	});

	const createViews: JsonCreateMySqlViewStatement[] = [];
	const dropViews: JsonDropViewStatement[] = [];
	const renameViews: JsonRenameViewStatement[] = [];

	createViews.push(
		...createdViews.filter((it) => !it.isExisting).map((it) => {
			return prepareMySqlCreateViewJson(
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
				prepareMySqlCreateViewJson(
					alteredView.name,
					definition!,
					meta,
				),
			);

			continue;
		}

		if (alteredView.alteredDefinition && action !== 'push') {
			createViews.push(
				prepareMySqlCreateViewJson(
					alteredView.name,
					definition!,
					meta,
					true,
				),
			);
			continue;
		}

		if (alteredView.alteredMeta) {
			throw new Error('unexpected');
		}
	}

	jsonStatements.push(...jsonMySqlCreateTables);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...dropViews);
	jsonStatements.push(...renameViews);

	jsonStatements.push(...jsonDeletedUniqueConstraints);
	jsonStatements.push(...jsonDeletedCheckConstraints);

	jsonStatements.push(...jsonDroppedReferencesForAlteredTables);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDeletedCompositePKs);
	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonDeletedUniqueConstraints);

	jsonStatements.push(...jsonCreateReferencesForCreatedTables);
	jsonStatements.push(...jsonCreateIndexesForCreatedTables);
	jsonStatements.push(...jsonCreatedCheckConstraints);

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);
	jsonStatements.push(...jsonCreateIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	// jsonStatements.push(...jsonDeletedCompositePKs);
	// jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...createViews);

	jsonStatements.push(...jsonAlteredUniqueConstraints);

	const sqlStatements = fromJson(jsonStatements, 'mysql');

	// const rTables = renamedTables.map((it) => {
	// 	return { from: it.from, to: it.to };
	// });

	return {
		statements: jsonStatements,
		sqlStatements,
		_meta: { columns: [], schemas: [], tables: [] },
	};
};
