import { mapEntries, mapKeys, mapValues } from '../global';
import { applyJsonDiff, diffColumns, diffIndPolicies, diffPolicies, diffSchemasOrTables } from '../jsonDiffer';
import type {
	JsonAddColumnStatement,
	JsonAlterCompositePK,
	JsonAlterIndPolicyStatement,
	JsonAlterPolicyStatement,
	JsonAlterTableSetSchema,
	JsonAlterUniqueConstraint,
	JsonAlterViewStatement,
	JsonCreateCheckConstraint,
	JsonCreateCompositePK,
	JsonCreateIndPolicyStatement,
	JsonCreatePgViewStatement,
	JsonCreatePolicyStatement,
	JsonCreateReferenceStatement,
	JsonCreateUniqueConstraint,
	JsonDeleteCheckConstraint,
	JsonDeleteCompositePK,
	JsonDeleteUniqueConstraint,
	JsonDisableRLSStatement,
	JsonDropColumnStatement,
	JsonDropIndPolicyStatement,
	JsonDropPolicyStatement,
	JsonDropViewStatement,
	JsonEnableRLSStatement,
	JsonIndRenamePolicyStatement,
	JsonReferenceStatement,
	JsonRenameColumnStatement,
	JsonRenamePolicyStatement,
	JsonRenameViewStatement,
	JsonStatement,
} from '../jsonStatements';
import {
	_prepareAddColumns,
	_prepareDropColumns,
	prepareAddCheckConstraint,
	prepareAddCompositePrimaryKeyPg,
	prepareAddUniqueConstraintPg,
	prepareAddValuesToEnumJson,
	prepareAlterCompositePrimaryKeyPg,
	prepareAlterIndPolicyJson,
	prepareAlterPolicyJson,
	prepareAlterReferencesJson,
	prepareAlterRoleJson,
	prepareAlterSequenceJson,
	prepareCreateEnumJson,
	prepareCreateIndPolicyJsons,
	prepareCreatePolicyJsons,
	prepareCreateReferencesJson,
	prepareCreateRoleJson,
	prepareCreateSchemasJson,
	prepareCreateSequenceJson,
	prepareDeleteCheckConstraint,
	prepareDeleteCompositePrimaryKeyPg,
	prepareDeleteSchemasJson,
	prepareDeleteUniqueConstraintPg,
	prepareDropEnumJson,
	prepareDropEnumValues,
	prepareDropIndexesJson,
	prepareDropIndPolicyJsons,
	prepareDropPolicyJsons,
	prepareDropReferencesJson,
	prepareDropRoleJson,
	prepareDropSequenceJson,
	prepareDropTableJson,
	prepareDropViewJson,
	prepareMoveEnumJson,
	prepareMoveSequenceJson,
	preparePgAlterColumns,
	preparePgAlterViewAddWithOptionJson,
	preparePgAlterViewAlterSchemaJson,
	preparePgAlterViewAlterTablespaceJson,
	preparePgAlterViewAlterUsingJson,
	preparePgAlterViewDropWithOptionJson,
	preparePgCreateIndexesJson,
	preparePgCreateTableJson,
	preparePgCreateViewJson,
	prepareRenameColumns,
	prepareRenameEnumJson,
	prepareRenameIndPolicyJsons,
	prepareRenamePolicyJsons,
	prepareRenameRoleJson,
	prepareRenameSchemasJson,
	prepareRenameSequenceJson,
	prepareRenameTableJson,
	prepareRenameViewJson,
} from '../jsonStatements';
import { copy } from '../utils';

import type {
	Column,
	ColumnsResolverInput,
	ColumnsResolverOutput,
	DiffResult,
	Enum,
	Named,
	PolicyResolverInput,
	PolicyResolverOutput,
	ResolverInput,
	ResolverOutput,
	ResolverOutputWithMoved,
	RolesResolverInput,
	RolesResolverOutput,
	Sequence,
	Table,
	TablePolicyResolverInput,
	TablePolicyResolverOutput,
} from '../snapshotsDiffer';
import {
	columnChangeFor,
	columnsResolver,
	diffResultScheme,
	enumsResolver,
	indPolicyResolver,
	nameChangeFor,
	nameSchemaChangeFor,
	policyResolver,
	roleResolver,
	schemaChangeFor,
	schemasResolver,
	sequencesResolver,
	tablesResolver,
	viewsResolver,
} from '../snapshotsDiffer';
import { fromJson } from '../sqlgenerator';
import type { PgSchema, PgSchemaSquashed, Policy, Role, View } from './pgSchema';
import { dryPg, PgSquasher, squashPgScheme } from './pgSchema';

export const diff = async (opts: {
	left?: PgSchema;
	right: PgSchema;
	mode?: 'push';
}) => {
	const left = opts.left ?? dryPg;
	const json1 = squashPgScheme(left);
	const json2 = squashPgScheme(opts.right);
	return _diff(
		json1,
		json2,
		schemasResolver,
		enumsResolver,
		sequencesResolver,
		policyResolver,
		indPolicyResolver,
		roleResolver,
		tablesResolver,
		columnsResolver,
		viewsResolver,
		left,
		opts.right,
		opts.mode,
	);
};

export const _diff = async (
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
	policyResolver: (
		input: TablePolicyResolverInput<Policy>,
	) => Promise<TablePolicyResolverOutput<Policy>>,
	indPolicyResolver: (
		input: PolicyResolverInput<Policy>,
	) => Promise<PolicyResolverOutput<Policy>>,
	roleResolver: (
		input: RolesResolverInput<Role>,
	) => Promise<RolesResolverOutput<Role>>,
	tablesResolver: (
		input: ResolverInput<Table>,
	) => Promise<ResolverOutputWithMoved<Table>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	viewsResolver: (
		input: ResolverInput<View>,
	) => Promise<ResolverOutputWithMoved<View>>,
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

	const rolesDiff = diffSchemasOrTables(
		schemasPatchedSnap1.roles,
		json2.roles,
	);

	const {
		created: createdRoles,
		deleted: deletedRoles,
		renamed: renamedRoles,
	} = await roleResolver({
		created: rolesDiff.added,
		deleted: rolesDiff.deleted,
	});

	schemasPatchedSnap1.roles = mapEntries(
		schemasPatchedSnap1.roles,
		(_, it) => {
			const { name } = nameChangeFor(it, renamedRoles);
			it.name = name;
			return [name, it];
		},
	);

	const rolesChangeMap = renamedRoles.reduce(
		(acc, it) => {
			acc[it.from.name] = {
				nameFrom: it.from.name,
				nameTo: it.to.name,
			};
			return acc;
		},
		{} as Record<
			string,
			{
				nameFrom: string;
				nameTo: string;
			}
		>,
	);

	schemasPatchedSnap1.roles = mapEntries(
		schemasPatchedSnap1.roles,
		(roleKey, roleValue) => {
			const key = roleKey;
			const change = rolesChangeMap[key];

			if (change) {
				roleValue.name = change.nameTo;
			}

			return [roleKey, roleValue];
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

	//// Policies

	const policyRes = diffPolicies(tablesPatchedSnap1.tables, json2.tables);

	const policyRenames = [] as {
		table: string;
		schema: string;
		renames: { from: Policy; to: Policy }[];
	}[];

	const policyCreates = [] as {
		table: string;
		schema: string;
		columns: Policy[];
	}[];

	const policyDeletes = [] as {
		table: string;
		schema: string;
		columns: Policy[];
	}[];

	for (let entry of Object.values(policyRes)) {
		const { renamed, created, deleted } = await policyResolver({
			tableName: entry.name,
			schema: entry.schema,
			deleted: entry.policies.deleted.map(
				action === 'push' ? PgSquasher.unsquashPolicyPush : PgSquasher.unsquashPolicy,
			),
			created: entry.policies.added.map(action === 'push' ? PgSquasher.unsquashPolicyPush : PgSquasher.unsquashPolicy),
		});

		if (created.length > 0) {
			policyCreates.push({
				table: entry.name,
				schema: entry.schema,
				columns: created,
			});
		}

		if (deleted.length > 0) {
			policyDeletes.push({
				table: entry.name,
				schema: entry.schema,
				columns: deleted,
			});
		}

		if (renamed.length > 0) {
			policyRenames.push({
				table: entry.name,
				schema: entry.schema,
				renames: renamed,
			});
		}
	}

	const policyRenamesDict = columnRenames.reduce(
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

	const policyPatchedSnap1 = copy(tablesPatchedSnap1);
	policyPatchedSnap1.tables = mapEntries(
		policyPatchedSnap1.tables,
		(tableKey, tableValue) => {
			const patchedPolicies = mapKeys(
				tableValue.policies,
				(policyKey, policy) => {
					const rens = policyRenamesDict[
						`${tableValue.schema || 'public'}.${tableValue.name}`
					] || [];

					const newName = columnChangeFor(policyKey, rens);
					const unsquashedPolicy = action === 'push'
						? PgSquasher.unsquashPolicyPush(policy)
						: PgSquasher.unsquashPolicy(policy);
					unsquashedPolicy.name = newName;
					policy = PgSquasher.squashPolicy(unsquashedPolicy);
					return newName;
				},
			);

			tableValue.policies = patchedPolicies;
			return [tableKey, tableValue];
		},
	);

	//// Individual policies

	const indPolicyRes = diffIndPolicies(policyPatchedSnap1.policies, json2.policies);

	const indPolicyCreates = [] as {
		policies: Policy[];
	}[];

	const indPolicyDeletes = [] as {
		policies: Policy[];
	}[];

	const { renamed: indPolicyRenames, created, deleted } = await indPolicyResolver({
		deleted: indPolicyRes.deleted.map((t) =>
			action === 'push' ? PgSquasher.unsquashPolicyPush(t.values) : PgSquasher.unsquashPolicy(t.values)
		),
		created: indPolicyRes.added.map((t) =>
			action === 'push' ? PgSquasher.unsquashPolicyPush(t.values) : PgSquasher.unsquashPolicy(t.values)
		),
	});

	if (created.length > 0) {
		indPolicyCreates.push({
			policies: created,
		});
	}

	if (deleted.length > 0) {
		indPolicyDeletes.push({
			policies: deleted,
		});
	}

	const indPolicyRenamesDict = indPolicyRenames.reduce(
		(acc, it) => {
			acc[it.from.name] = {
				nameFrom: it.from.name,
				nameTo: it.to.name,
			};
			return acc;
		},
		{} as Record<
			string,
			{
				nameFrom: string;
				nameTo: string;
			}
		>,
	);

	const indPolicyPatchedSnap1 = copy(policyPatchedSnap1);
	indPolicyPatchedSnap1.policies = mapEntries(
		indPolicyPatchedSnap1.policies,
		(policyKey, policyValue) => {
			const key = policyKey;
			const change = indPolicyRenamesDict[key];

			if (change) {
				policyValue.name = change.nameTo;
			}

			return [policyKey, policyValue];
		},
	);

	////
	const viewsDiff = diffSchemasOrTables(indPolicyPatchedSnap1.views, json2.views);

	const {
		created: createdViews,
		deleted: deletedViews,
		renamed: renamedViews,
		moved: movedViews,
	} = await viewsResolver({
		created: viewsDiff.added,
		deleted: viewsDiff.deleted,
	});

	const renamesViewDic: Record<string, { to: string; from: string }> = {};
	renamedViews.forEach((it) => {
		renamesViewDic[`${it.from.schema}.${it.from.name}`] = { to: it.to.name, from: it.from.name };
	});

	const movedViewDic: Record<string, { to: string; from: string }> = {};
	movedViews.forEach((it) => {
		movedViewDic[`${it.schemaFrom}.${it.name}`] = { to: it.schemaTo, from: it.schemaFrom };
	});

	const viewsPatchedSnap1 = copy(policyPatchedSnap1);
	viewsPatchedSnap1.views = mapEntries(
		viewsPatchedSnap1.views,
		(viewKey, viewValue) => {
			const rename = renamesViewDic[`${viewValue.schema}.${viewValue.name}`];
			const moved = movedViewDic[`${viewValue.schema}.${viewValue.name}`];

			if (rename) {
				viewValue.name = rename.to;
				viewKey = `${viewValue.schema}.${viewValue.name}`;
			}

			if (moved) viewKey = `${moved.to}.${viewValue.name}`;

			return [viewKey, viewValue];
		},
	);

	const diffResult = applyJsonDiff(viewsPatchedSnap1, json2);

	const typedResult: DiffResult = diffResultScheme.parse(diffResult);

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

	if (movedTables) {
		for (let it of movedTables) {
			jsonSetTableSchemas.push({
				type: 'alter_table_set_schema',
				tableName: it.name,
				schemaFrom: it.schemaFrom || 'public',
				schemaTo: it.schemaTo || 'public',
			});
		}
	}

	const jsonDeletedCheckConstraints: JsonDeleteCheckConstraint[] = [];
	const jsonCreatedCheckConstraints: JsonCreateCheckConstraint[] = [];

	for (let it of alteredTables) {
		// This part is needed to make sure that same columns in a table are not triggered for change
		// there is a case where orm and kit are responsible for pk name generation and one of them is not sorting name
		// We double-check that pk with same set of columns are both in added and deleted diffs
		let addedColumns: { name: string; columns: string[] } | undefined;
		for (const addedPkName of Object.keys(it.addedCompositePKs)) {
			const addedPkColumns = it.addedCompositePKs[addedPkName];
			addedColumns = PgSquasher.unsquashPK(addedPkColumns);
		}

		let deletedColumns: { name: string; columns: string[] } | undefined;
		for (const deletedPkName of Object.keys(it.deletedCompositePKs)) {
			const deletedPkColumns = it.deletedCompositePKs[deletedPkName];
			deletedColumns = PgSquasher.unsquashPK(deletedPkColumns);
		}

		// Don't need to sort, but need to add tests for it
		// addedColumns.sort();
		// deletedColumns.sort();
		const doPerformDeleteAndCreate = JSON.stringify(addedColumns ?? {}) !== JSON.stringify(deletedColumns ?? {});

		let addedCompositePKs: JsonCreateCompositePK[] = [];
		let deletedCompositePKs: JsonDeleteCompositePK[] = [];
		let alteredCompositePKs: JsonAlterCompositePK[] = [];
		if (doPerformDeleteAndCreate) {
			addedCompositePKs = prepareAddCompositePrimaryKeyPg(
				it.name,
				it.schema,
				it.addedCompositePKs,
			);
			deletedCompositePKs = prepareDeleteCompositePrimaryKeyPg(
				it.name,
				it.schema,
				it.deletedCompositePKs,
			);
		}
		alteredCompositePKs = prepareAlterCompositePrimaryKeyPg(
			it.name,
			it.schema,
			it.alteredCompositePKs,
		);

		// add logic for unique constraints
		let addedUniqueConstraints: JsonCreateUniqueConstraint[] = [];
		let deletedUniqueConstraints: JsonDeleteUniqueConstraint[] = [];
		let alteredUniqueConstraints: JsonAlterUniqueConstraint[] = [];
		let createCheckConstraints: JsonCreateCheckConstraint[] = [];
		let deleteCheckConstraints: JsonDeleteCheckConstraint[] = [];

		addedUniqueConstraints = prepareAddUniqueConstraintPg(
			it.name,
			it.schema,
			it.addedUniqueConstraints,
		);
		deletedUniqueConstraints = prepareDeleteUniqueConstraintPg(
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
				...prepareAddUniqueConstraintPg(it.name, it.schema, added),
			);
			deletedUniqueConstraints.push(
				...prepareDeleteUniqueConstraintPg(it.name, it.schema, deleted),
			);
		}

		createCheckConstraints = prepareAddCheckConstraint(it.name, it.schema, it.addedCheckConstraints);
		deleteCheckConstraints = prepareDeleteCheckConstraint(
			it.name,
			it.schema,
			it.deletedCheckConstraints,
		);

		if (it.alteredCheckConstraints && action !== 'push') {
			const added: Record<string, string> = {};
			const deleted: Record<string, string> = {};

			for (const k of Object.keys(it.alteredCheckConstraints)) {
				added[k] = it.alteredCheckConstraints[k].__new;
				deleted[k] = it.alteredCheckConstraints[k].__old;
			}
			createCheckConstraints.push(...prepareAddCheckConstraint(it.name, it.schema, added));
			deleteCheckConstraints.push(...prepareDeleteCheckConstraint(it.name, it.schema, deleted));
		}

		jsonCreatedCheckConstraints.push(...createCheckConstraints);
		jsonDeletedCheckConstraints.push(...deleteCheckConstraints);

		jsonAddedCompositePKs.push(...addedCompositePKs);
		jsonDeletedCompositePKs.push(...deletedCompositePKs);
		jsonAlteredCompositePKs.push(...alteredCompositePKs);

		jsonAddedUniqueConstraints.push(...addedUniqueConstraints);
		jsonDeletedUniqueConstraints.push(...deletedUniqueConstraints);
		jsonAlteredUniqueConstraints.push(...alteredUniqueConstraints);
	}

	// const rColumns = jsonRenameColumnsStatements.map((it) => {
	// 	const tableName = it.tableName;
	// 	const schema = it.schema;
	// 	return {
	// 		from: { schema, table: tableName, column: it.oldColumnName },
	// 		to: { schema, table: tableName, column: it.newColumnName },
	// 	};
	// });

	const jsonTableAlternations = alteredTables
		.map((it) => {
			return preparePgAlterColumns(
				it.name,
				it.schema,
				it.altered,
				json2,
				json1,
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

	const jsonCreatePoliciesStatements: JsonCreatePolicyStatement[] = [];
	const jsonDropPoliciesStatements: JsonDropPolicyStatement[] = [];
	const jsonAlterPoliciesStatements: JsonAlterPolicyStatement[] = [];
	const jsonRenamePoliciesStatements: JsonRenamePolicyStatement[] = [];

	const jsonRenameIndPoliciesStatements: JsonIndRenamePolicyStatement[] = [];
	const jsonCreateIndPoliciesStatements: JsonCreateIndPolicyStatement[] = [];
	const jsonDropIndPoliciesStatements: JsonDropIndPolicyStatement[] = [];
	const jsonAlterIndPoliciesStatements: JsonAlterIndPolicyStatement[] = [];

	const jsonEnableRLSStatements: JsonEnableRLSStatement[] = [];
	const jsonDisableRLSStatements: JsonDisableRLSStatement[] = [];

	for (let it of indPolicyRenames) {
		jsonRenameIndPoliciesStatements.push(
			...prepareRenameIndPolicyJsons([it]),
		);
	}

	for (const it of indPolicyCreates) {
		jsonCreateIndPoliciesStatements.push(
			...prepareCreateIndPolicyJsons(
				it.policies,
			),
		);
	}

	for (const it of indPolicyDeletes) {
		jsonDropIndPoliciesStatements.push(
			...prepareDropIndPolicyJsons(
				it.policies,
			),
		);
	}

	typedResult.alteredPolicies.forEach(({ values }) => {
		// return prepareAlterIndPolicyJson(json1.policies[it.name], json2.policies[it.name]);

		const policy = action === 'push' ? PgSquasher.unsquashPolicyPush(values) : PgSquasher.unsquashPolicy(values);

		const newPolicy = action === 'push'
			? PgSquasher.unsquashPolicyPush(json2.policies[policy.name].values)
			: PgSquasher.unsquashPolicy(json2.policies[policy.name].values);
		const oldPolicy = action === 'push'
			? PgSquasher.unsquashPolicyPush(json2.policies[policy.name].values)
			: PgSquasher.unsquashPolicy(json1.policies[policy.name].values);

		if (newPolicy.as !== oldPolicy.as) {
			jsonDropIndPoliciesStatements.push(
				...prepareDropIndPolicyJsons(
					[oldPolicy],
				),
			);

			jsonCreateIndPoliciesStatements.push(
				...prepareCreateIndPolicyJsons(
					[newPolicy],
				),
			);
			return;
		}

		if (newPolicy.for !== oldPolicy.for) {
			jsonDropIndPoliciesStatements.push(
				...prepareDropIndPolicyJsons(
					[oldPolicy],
				),
			);

			jsonCreateIndPoliciesStatements.push(
				...prepareCreateIndPolicyJsons(
					[newPolicy],
				),
			);
			return;
		}

		// alter
		jsonAlterIndPoliciesStatements.push(
			prepareAlterIndPolicyJson(
				oldPolicy,
				newPolicy,
			),
		);
	});

	for (let it of policyRenames) {
		jsonRenamePoliciesStatements.push(
			...prepareRenamePolicyJsons(it.table, it.schema, it.renames),
		);
	}

	for (const it of policyCreates) {
		jsonCreatePoliciesStatements.push(
			...prepareCreatePolicyJsons(
				it.table,
				it.schema,
				it.columns,
			),
		);
	}

	for (const it of policyDeletes) {
		jsonDropPoliciesStatements.push(
			...prepareDropPolicyJsons(
				it.table,
				it.schema,
				it.columns,
			),
		);
	}

	alteredTables.forEach((it) => {
		// handle policies
		Object.keys(it.alteredPolicies).forEach((policyName: string) => {
			const newPolicy = action === 'push'
				? PgSquasher.unsquashPolicyPush(it.alteredPolicies[policyName].__new)
				: PgSquasher.unsquashPolicy(it.alteredPolicies[policyName].__new);
			const oldPolicy = action === 'push'
				? PgSquasher.unsquashPolicyPush(it.alteredPolicies[policyName].__old)
				: PgSquasher.unsquashPolicy(it.alteredPolicies[policyName].__old);

			if (newPolicy.as !== oldPolicy.as) {
				jsonDropPoliciesStatements.push(
					...prepareDropPolicyJsons(
						it.name,
						it.schema,
						[oldPolicy],
					),
				);

				jsonCreatePoliciesStatements.push(
					...prepareCreatePolicyJsons(
						it.name,
						it.schema,
						[newPolicy],
					),
				);
				return;
			}

			if (newPolicy.for !== oldPolicy.for) {
				jsonDropPoliciesStatements.push(
					...prepareDropPolicyJsons(
						it.name,
						it.schema,
						[oldPolicy],
					),
				);

				jsonCreatePoliciesStatements.push(
					...prepareCreatePolicyJsons(
						it.name,
						it.schema,
						[newPolicy],
					),
				);
				return;
			}

			// alter
			jsonAlterPoliciesStatements.push(
				prepareAlterPolicyJson(
					it.name,
					it.schema,
					it.alteredPolicies[policyName].__old,
					it.alteredPolicies[policyName].__new,
				),
			);
		});

		// Handle enabling and disabling RLS
		for (const table of Object.values(json2.tables)) {
			const policiesInCurrentState = Object.keys(table.policies);
			const tableInPreviousState =
				columnsPatchedSnap1.tables[`${table.schema === '' ? 'public' : table.schema}.${table.name}`];
			const policiesInPreviousState = tableInPreviousState ? Object.keys(tableInPreviousState.policies) : [];

			// const indPoliciesInCurrentState = Object.keys(table.policies);
			// const indPoliciesInPreviousState = Object.keys(columnsPatchedSnap1.policies);

			if (
				(policiesInPreviousState.length === 0 && policiesInCurrentState.length > 0) && !table.isRLSEnabled
			) {
				jsonEnableRLSStatements.push({ type: 'enable_rls', tableName: table.name, schema: table.schema });
			}

			if (
				(policiesInPreviousState.length > 0 && policiesInCurrentState.length === 0) && !table.isRLSEnabled
			) {
				jsonDisableRLSStatements.push({ type: 'disable_rls', tableName: table.name, schema: table.schema });
			}

			// handle table.isRLSEnabled
			const wasRlsEnabled = tableInPreviousState ? tableInPreviousState.isRLSEnabled : false;
			if (table.isRLSEnabled !== wasRlsEnabled) {
				if (table.isRLSEnabled) {
					// was force enabled
					jsonEnableRLSStatements.push({ type: 'enable_rls', tableName: table.name, schema: table.schema });
				} else if (
					!table.isRLSEnabled && policiesInCurrentState.length === 0
				) {
					// was force disabled
					jsonDisableRLSStatements.push({ type: 'disable_rls', tableName: table.name, schema: table.schema });
				}
			}
		}

		for (const table of Object.values(columnsPatchedSnap1.tables)) {
			const tableInCurrentState = json2.tables[`${table.schema === '' ? 'public' : table.schema}.${table.name}`];

			if (tableInCurrentState === undefined && !table.isRLSEnabled) {
				jsonDisableRLSStatements.push({ type: 'disable_rls', tableName: table.name, schema: table.schema });
			}
		}

		// handle indexes
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

	const jsonAlterEnumsWithAddedValues = typedResult.alteredEnums
		.map((it) => {
			return prepareAddValuesToEnumJson(it.name, it.schema, it.addedValues);
		})
		.flat() ?? [];

	const jsonAlterEnumsWithDroppedValues = typedResult.alteredEnums
		.map((it) => {
			return prepareDropEnumValues(it.name, it.schema, it.deletedValues, curFull);
		})
		.flat() ?? [];

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

	const createRoles = createdRoles.map((it) => {
		return prepareCreateRoleJson(it);
	}) ?? [];

	const dropRoles = deletedRoles.map((it) => {
		return prepareDropRoleJson(it.name);
	});

	const renameRoles = renamedRoles.map((it) => {
		return prepareRenameRoleJson(it.from.name, it.to.name);
	});

	const jsonAlterRoles = typedResult.alteredRoles
		.map((it) => {
			return prepareAlterRoleJson(it);
		})
		.flat() ?? [];

	////////////
	const createSchemas = prepareCreateSchemasJson(
		createdSchemas.map((it) => it.name),
	);

	const renameSchemas = prepareRenameSchemasJson(
		renamedSchemas.map((it) => ({ from: it.from.name, to: it.to.name })),
	);

	const dropSchemas = prepareDeleteSchemasJson(
		deletedSchemas.map((it) => it.name),
	);

	const createTables = createdTables.map((it) => {
		return preparePgCreateTableJson(it, curFull);
	});

	jsonCreatePoliciesStatements.push(...([] as JsonCreatePolicyStatement[]).concat(
		...(createdTables.map((it) =>
			prepareCreatePolicyJsons(
				it.name,
				it.schema,
				Object.values(it.policies).map(action === 'push' ? PgSquasher.unsquashPolicyPush : PgSquasher.unsquashPolicy),
			)
		)),
	));
	const createViews: JsonCreatePgViewStatement[] = [];
	const dropViews: JsonDropViewStatement[] = [];
	const renameViews: JsonRenameViewStatement[] = [];
	const alterViews: JsonAlterViewStatement[] = [];

	createViews.push(
		...createdViews.filter((it) => !it.isExisting).map((it) => {
			return preparePgCreateViewJson(
				it.name,
				it.schema,
				it.definition!,
				it.materialized,
				it.withNoData,
				it.with,
				it.using,
				it.tablespace,
			);
		}),
	);

	dropViews.push(
		...deletedViews.filter((it) => !it.isExisting).map((it) => {
			return prepareDropViewJson(it.name, it.schema, it.materialized);
		}),
	);

	renameViews.push(
		...renamedViews.filter((it) => !it.to.isExisting && !json1.views[`${it.from.schema}.${it.from.name}`].isExisting)
			.map((it) => {
				return prepareRenameViewJson(it.to.name, it.from.name, it.to.schema, it.to.materialized);
			}),
	);

	alterViews.push(
		...movedViews.filter((it) =>
			!json2.views[`${it.schemaTo}.${it.name}`].isExisting && !json1.views[`${it.schemaFrom}.${it.name}`].isExisting
		).map((it) => {
			return preparePgAlterViewAlterSchemaJson(
				it.schemaTo,
				it.schemaFrom,
				it.name,
				json2.views[`${it.schemaTo}.${it.name}`].materialized,
			);
		}),
	);

	const alteredViews = typedResult.alteredViews.filter((it) => !json2.views[`${it.schema}.${it.name}`].isExisting);

	for (const alteredView of alteredViews) {
		const viewKey = `${alteredView.schema}.${alteredView.name}`;

		const { materialized, with: withOption, definition, withNoData, using, tablespace } = json2.views[viewKey];

		if (alteredView.alteredExisting || (alteredView.alteredDefinition && action !== 'push')) {
			dropViews.push(prepareDropViewJson(alteredView.name, alteredView.schema, materialized));

			createViews.push(
				preparePgCreateViewJson(
					alteredView.name,
					alteredView.schema,
					definition!,
					materialized,
					withNoData,
					withOption,
					using,
					tablespace,
				),
			);

			continue;
		}

		if (alteredView.addedWithOption) {
			alterViews.push(
				preparePgAlterViewAddWithOptionJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.addedWithOption,
				),
			);
		}

		if (alteredView.deletedWithOption) {
			alterViews.push(
				preparePgAlterViewDropWithOptionJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.deletedWithOption,
				),
			);
		}

		if (alteredView.addedWith) {
			alterViews.push(
				preparePgAlterViewAddWithOptionJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.addedWith,
				),
			);
		}

		if (alteredView.deletedWith) {
			alterViews.push(
				preparePgAlterViewDropWithOptionJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.deletedWith,
				),
			);
		}

		if (alteredView.alteredWith) {
			alterViews.push(
				preparePgAlterViewAddWithOptionJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.alteredWith,
				),
			);
		}

		if (alteredView.alteredTablespace) {
			alterViews.push(
				preparePgAlterViewAlterTablespaceJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.alteredTablespace.__new,
				),
			);
		}

		if (alteredView.alteredUsing) {
			alterViews.push(
				preparePgAlterViewAlterUsingJson(
					alteredView.name,
					alteredView.schema,
					materialized,
					alteredView.alteredUsing.__new,
				),
			);
		}
	}

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

	jsonStatements.push(...renameRoles);
	jsonStatements.push(...dropRoles);
	jsonStatements.push(...createRoles);
	jsonStatements.push(...jsonAlterRoles);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonEnableRLSStatements);
	jsonStatements.push(...jsonDisableRLSStatements);
	jsonStatements.push(...dropViews);
	jsonStatements.push(...renameViews);
	jsonStatements.push(...alterViews);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDeletedUniqueConstraints);
	jsonStatements.push(...jsonDeletedCheckConstraints);

	jsonStatements.push(...jsonDroppedReferencesForAlteredTables);

	jsonStatements.push(...jsonAlterEnumsWithDroppedValues);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexesForAllAlteredTables);

	jsonStatements.push(...jsonDeletedCompositePKs);
	jsonStatements.push(...jsonTableAlternations);
	jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAddColumnsStatemets);

	// PATCHED, need to run before fks
	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonCreateIndexesForCreatedTables);
	jsonStatements.push(...jsonCreateIndexesFoAlteredTables);
	jsonStatements.push(...jsonAlteredUniqueConstraints);

	// ----

	jsonStatements.push(...jsonCreateReferencesForCreatedTables);

	jsonStatements.push(...jsonCreatedReferencesForAlteredTables);

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonCreatedCheckConstraints);

	jsonStatements.push(...createViews);

	jsonStatements.push(...jsonRenamePoliciesStatements);
	jsonStatements.push(...jsonDropPoliciesStatements);
	jsonStatements.push(...jsonCreatePoliciesStatements);
	jsonStatements.push(...jsonAlterPoliciesStatements);

	jsonStatements.push(...jsonRenameIndPoliciesStatements);
	jsonStatements.push(...jsonDropIndPoliciesStatements);
	jsonStatements.push(...jsonCreateIndPoliciesStatements);
	jsonStatements.push(...jsonAlterIndPoliciesStatements);

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

	// enum filters
	// Need to find add and drop enum values in same enum and remove add values
	const filteredEnumsJsonStatements = filteredJsonStatements.filter((st) => {
		if (st.type === 'alter_type_add_value') {
			if (
				filteredJsonStatements.find(
					(it) =>
						it.type === 'alter_type_drop_value'
						&& it.name === st.name
						&& it.enumSchema === st.schema,
				)
			) {
				return false;
			}
		}
		return true;
	});

	// This is needed because in sql generator on type pg_alter_table_alter_column_set_type and alter_type_drop_value
	// drizzle kit checks whether column has defaults to cast them to new types properly
	const filteredEnums2JsonStatements = filteredEnumsJsonStatements.filter((st) => {
		if (st.type === 'alter_table_alter_column_set_default') {
			if (
				filteredEnumsJsonStatements.find(
					(it) =>
						it.type === 'pg_alter_table_alter_column_set_type'
						&& it.columnDefault === st.newDefaultValue
						&& it.columnName === st.columnName
						&& it.tableName === st.tableName
						&& it.schema === st.schema,
				)
			) {
				return false;
			}

			if (
				filteredEnumsJsonStatements.find(
					(it) =>
						it.type === 'alter_type_drop_value'
						&& it.columnsWithEnum.find((column) =>
							column.default === st.newDefaultValue
							&& column.column === st.columnName
							&& column.table === st.tableName
							&& column.tableSchema === st.schema
						),
				)
			) {
				return false;
			}
		}
		return true;
	});

	const sqlStatements = fromJson(filteredEnums2JsonStatements, 'postgresql', action);

	const uniqueSqlStatements: string[] = [];
	sqlStatements.forEach((ss) => {
		if (!uniqueSqlStatements.includes(ss)) {
			uniqueSqlStatements.push(ss);
		}
	});

	// const rSchemas = renamedSchemas.map((it) => ({
	// 	from: it.from.name,
	// 	to: it.to.name,
	// }));

	// const rTables = renamedTables.map((it) => {
	// 	return { from: it.from, to: it.to };
	// });

	return {
		statements: filteredEnums2JsonStatements,
		sqlStatements: uniqueSqlStatements,
		_meta: { columns: [], schemas: [], tables: [] },
	};
};
