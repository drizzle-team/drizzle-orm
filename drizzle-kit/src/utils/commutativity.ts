import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { originUUID } from '../utils';
import type { Dialect } from './schemaValidator';

// Postgres-only imports
import { createDDL, type PostgresDDL } from '../dialects/postgres/ddl';
import { ddlDiffDry } from '../dialects/postgres/diff';
import { drySnapshot, type PostgresSnapshot } from '../dialects/postgres/snapshot';
import type { JsonStatement } from '../dialects/postgres/statements';

export type BranchConflict = {
	parentId: string;
	parentPath?: string;
	branchA: { headId: string; path: string; statements: JsonStatement[] };
	branchB: { headId: string; path: string; statements: JsonStatement[] };
	reasons: string[];
};

export type NonCommutativityReport = {
	conflicts: BranchConflict[];
};

type SnapshotNode<TSnapshot extends { id: string; prevId: string }> = {
	id: string;
	prevId: string;
	path: string; // full path to snapshot.json
	folderPath: string; // folder containing snapshot.json
	raw: TSnapshot;
};

const footprintMap: Record<JsonStatement['type'], JsonStatement['type'][]> = {
	// Table operations
	create_table: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
	],
	drop_table: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
		'add_column',
		'drop_column',
		'alter_column',
		'recreate_column',
		'rename_column',
		'alter_rls',
	],
	rename_table: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
	],
	recreate_table: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
	],
	move_table: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
	],
	remove_from_schema: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
	],
	set_new_schema: [
		'create_table',
		'drop_table',
		'rename_table',
		'recreate_table',
		'move_table',
		'remove_from_schema',
		'set_new_schema',
	],

	// Column operations
	add_column: ['add_column', 'alter_column', 'drop_column', 'rename_column', 'recreate_column'],
	drop_column: ['add_column', 'drop_column', 'alter_column', 'rename_column', 'recreate_column'],
	alter_column: ['add_column', 'drop_column', 'alter_column', 'rename_column', 'recreate_column'],
	recreate_column: ['add_column', 'drop_column', 'alter_column', 'recreate_column', 'rename_column'],
	rename_column: ['add_column', 'drop_column', 'alter_column', 'recreate_column', 'rename_column'],

	// Index operations
	create_index: ['create_index', 'drop_index', 'rename_index'],
	drop_index: ['create_index', 'drop_index', 'rename_index'],
	rename_index: ['create_index', 'drop_index', 'rename_index'],

	// Primary key operations
	add_pk: ['add_pk', 'drop_pk', 'alter_pk'],
	drop_pk: ['add_pk', 'drop_pk', 'alter_pk'],
	alter_pk: ['add_pk', 'drop_pk', 'alter_pk'],

	// Foreign key operations
	create_fk: ['create_fk', 'drop_fk', 'recreate_fk'],
	drop_fk: ['create_fk', 'drop_fk', 'recreate_fk'],
	recreate_fk: ['create_fk', 'drop_fk', 'recreate_fk'],

	// Unique constraint operations
	add_unique: ['add_unique', 'drop_unique', 'alter_unique'],
	drop_unique: ['add_unique', 'drop_unique', 'alter_unique'],
	alter_unique: ['add_unique', 'drop_unique', 'alter_unique'],

	// Check constraint operations
	add_check: ['add_check', 'drop_check', 'alter_check'],
	drop_check: ['add_check', 'drop_check', 'alter_check'],
	alter_check: ['add_check', 'drop_check', 'alter_check'],

	// Constraint operations
	rename_constraint: [
		'rename_constraint',
		'add_pk',
		'drop_pk',
		'alter_pk',
		'add_unique',
		'drop_unique',
		'alter_unique',
		'add_check',
		'drop_check',
		'alter_check',
		'create_fk',
		'drop_fk',
		'recreate_fk',
	],

	// Enum operations
	create_enum: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
	drop_enum: [
		'create_enum',
		'drop_enum',
		'rename_enum',
		'alter_enum',
		'recreate_enum',
		'move_enum',
		'alter_type_drop_value',
	],
	rename_enum: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
	alter_enum: [
		'create_enum',
		'drop_enum',
		'rename_enum',
		'alter_enum',
		'recreate_enum',
		'move_enum',
		'alter_type_drop_value',
	],
	recreate_enum: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
	move_enum: ['create_enum', 'drop_enum', 'rename_enum', 'alter_enum', 'recreate_enum', 'move_enum'],
	alter_type_drop_value: ['drop_enum', 'alter_enum', 'alter_type_drop_value'],

	// Sequence operations
	create_sequence: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
	drop_sequence: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
	rename_sequence: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
	alter_sequence: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],
	move_sequence: ['create_sequence', 'drop_sequence', 'rename_sequence', 'alter_sequence', 'move_sequence'],

	// View operations
	create_view: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'recreate_view', 'move_view'],
	drop_view: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'recreate_view', 'move_view'],
	rename_view: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'recreate_view', 'move_view'],
	alter_view: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'recreate_view', 'move_view'],
	recreate_view: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'recreate_view', 'move_view'],
	move_view: ['create_view', 'drop_view', 'rename_view', 'alter_view', 'recreate_view', 'move_view'],

	// Schema operations
	create_schema: ['create_schema', 'drop_schema', 'rename_schema'],
	drop_schema: ['create_schema', 'drop_schema', 'rename_schema'],
	rename_schema: ['create_schema', 'drop_schema', 'rename_schema'],

	// Policy operations
	create_policy: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
	drop_policy: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
	rename_policy: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
	alter_policy: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],
	recreate_policy: ['create_policy', 'drop_policy', 'rename_policy', 'alter_policy', 'recreate_policy'],

	// RLS operations
	alter_rls: ['alter_rls', 'create_policy', 'drop_policy', 'alter_policy', 'recreate_policy'],

	// Role operations
	create_role: ['create_role', 'drop_role', 'rename_role', 'alter_role'],
	drop_role: [
		'create_role',
		'drop_role',
		'rename_role',
		'alter_role',
		'grant_privilege',
		'revoke_privilege',
		'regrant_privilege',
	],
	rename_role: ['create_role', 'drop_role', 'rename_role', 'alter_role'],
	alter_role: ['create_role', 'drop_role', 'rename_role', 'alter_role'],

	// Privilege operations
	grant_privilege: ['grant_privilege', 'revoke_privilege', 'regrant_privilege'],
	revoke_privilege: ['grant_privilege', 'revoke_privilege', 'regrant_privilege'],
	regrant_privilege: ['grant_privilege', 'revoke_privilege', 'regrant_privilege'],
};

function formatFootprint(action: string, schema: string, objectName: string, columnName: string): string {
	return `${action};${schema};${objectName};${columnName}`;
}

function extractStatementInfo(
	statement: JsonStatement,
): { action: string; schema: string; objectName: string; columnName: string } {
	const action = statement.type;
	let schema = '';
	let objectName = '';
	let columnName = '';

	switch (statement.type) {
		// Table operations
		case 'create_table':
		case 'drop_table':
		case 'recreate_table':
			schema = statement.table.schema;
			objectName = statement.table.name;
			break;
		case 'rename_table':
			schema = statement.schema;
			objectName = statement.from;
			break;
		case 'move_table':
			schema = statement.from;
			objectName = statement.name;
			break;
		case 'remove_from_schema':
			schema = statement.schema;
			objectName = statement.table;
			break;
		case 'set_new_schema':
			schema = statement.from;
			objectName = statement.table;
			break;

		// Column operations
		case 'add_column':
		case 'drop_column':
		case 'recreate_column':
			schema = statement.column.schema;
			objectName = statement.column.table;
			columnName = statement.column.name;
			break;
		case 'alter_column':
			schema = statement.to.schema;
			objectName = statement.to.table;
			columnName = statement.to.name;
			break;
		case 'rename_column':
			schema = statement.from.schema;
			objectName = statement.from.table;
			columnName = statement.from.name;
			break;

		// Index operations
		case 'create_index':
		case 'drop_index':
			schema = statement.index.schema;
			objectName = statement.index.name;
			break;
		case 'rename_index':
			schema = statement.schema;
			objectName = statement.from;
			break;

		// Primary key operations
		case 'add_pk':
		case 'drop_pk':
		case 'alter_pk':
			schema = statement.pk.schema;
			objectName = statement.pk.table;
			break;

		// Foreign key operations
		case 'create_fk':
		case 'drop_fk':
		case 'recreate_fk':
			schema = statement.fk.schema;
			objectName = statement.fk.table;
			break;

		// Unique constraint operations
		case 'add_unique':
		case 'drop_unique':
			schema = statement.unique.schema;
			objectName = statement.unique.table;
			break;
		case 'alter_unique':
			schema = (statement as any).diff.schema;
			objectName = (statement as any).diff.table;
			break;

		// Check constraint operations
		case 'add_check':
		case 'drop_check':
		case 'alter_check':
			schema = statement.check.schema;
			objectName = statement.check.table;
			break;

		// Constraint operations
		case 'rename_constraint':
			schema = statement.schema;
			objectName = statement.table;
			break;

		// Enum operations
		case 'create_enum':
		case 'drop_enum':
		case 'alter_enum':
			schema = statement.enum.schema;
			objectName = statement.enum.name;
			break;
		case 'recreate_enum':
			schema = statement.to.schema;
			objectName = statement.to.name;
			break;
		case 'rename_enum':
			schema = statement.schema;
			objectName = statement.from;
			break;
		case 'move_enum':
			schema = statement.from.schema || 'public';
			objectName = statement.from.name;
			break;
		case 'alter_type_drop_value':
			schema = statement.enum.schema;
			objectName = statement.enum.name;
			break;

		// Sequence operations
		case 'create_sequence':
		case 'drop_sequence':
		case 'alter_sequence':
			schema = statement.sequence.schema;
			objectName = statement.sequence.name;
			break;
		case 'rename_sequence':
			schema = statement.from.schema;
			objectName = statement.from.name;
			break;
		case 'move_sequence':
			schema = statement.from.schema || 'public';
			objectName = statement.from.name;
			break;

		// View operations
		case 'create_view':
		case 'drop_view':
			schema = statement.view.schema;
			objectName = statement.view.name;
			break;
		case 'alter_view':
			schema = statement.view.schema;
			objectName = statement.view.name;
			break;
		case 'recreate_view':
			schema = statement.to.schema;
			objectName = statement.to.name;
			break;
		case 'rename_view':
			schema = statement.from.schema;
			objectName = statement.from.name;
			break;
		case 'move_view':
			schema = statement.fromSchema;
			objectName = statement.view.name;
			break;

		// Schema operations
		case 'create_schema':
		case 'drop_schema':
			objectName = statement.name;
			break;
		case 'rename_schema':
			objectName = statement.from.name;
			break;

		// Policy operations
		case 'create_policy':
		case 'drop_policy':
		case 'alter_policy':
		case 'recreate_policy':
			schema = statement.policy.schema;
			objectName = statement.policy.table;
			break;
		case 'rename_policy':
			schema = statement.from.schema;
			objectName = statement.from.table;
			break;

		// RLS operations
		case 'alter_rls':
			schema = (statement as any).schema;
			objectName = (statement as any).name;
			break;

		// Role operations
		case 'create_role':
		case 'drop_role':
		case 'alter_role':
			objectName = statement.role.name;
			break;
		case 'rename_role':
			objectName = statement.from.name;
			break;

		// Privilege operations
		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege':
			schema = statement.privilege.schema || '';
			objectName = statement.privilege.table || '';
			break;

		default:
			break;
	}

	return { action, schema, objectName, columnName };
}

export function footprint(statement: JsonStatement, snapshot?: PostgresSnapshot): [string[], string[]] {
	const info = extractStatementInfo(statement);
	const conflictingTypes = footprintMap[statement.type];

	const statementFootprint = [formatFootprint(statement.type, info.schema, info.objectName, info.columnName)];

	let conflictFootprints = conflictingTypes.map((conflictType) =>
		formatFootprint(conflictType, info.schema, info.objectName, info.columnName)
	);

	if (snapshot) {
		const expandedFootprints = expandFootprintsFromSnapshot(statement, info, conflictingTypes, snapshot);
		conflictFootprints = [...conflictFootprints, ...expandedFootprints];
	}

	return [statementFootprint, conflictFootprints];
}

function getFolderNameFromNodeId(node: SnapshotNode<any>): string {
	// path pattern: "path/to/folder/snapshot.json"
	const folderPath = dirname(node.path);
	return folderPath.split('/').pop() || '';
}

function generateLeafFootprints(statements: JsonStatement[], folderName: string, snapshot?: PostgresSnapshot): {
	statementHashes: Array<{ hash: string; statement: JsonStatement; statementId: string }>;
	conflictFootprints: Array<{ hash: string; statement: JsonStatement; statementId: string }>;
} {
	const statementHashes: Array<{ hash: string; statement: JsonStatement; statementId: string }> = [];
	const conflictFootprints: Array<{ hash: string; statement: JsonStatement; statementId: string }> = [];

	for (let i = 0; i < statements.length; i++) {
		const statement = statements[i];
		const [hashes, conflicts] = footprint(statement, snapshot);

		for (const hash of hashes) {
			statementHashes.push({ hash, statement, statementId: folderName });
		}

		for (const conflict of conflicts) {
			conflictFootprints.push({ hash: conflict, statement, statementId: folderName });
		}
	}

	return { statementHashes, conflictFootprints };
}

function expandFootprintsFromSnapshot(
	statement: JsonStatement,
	info: { action: string; schema: string; objectName: string; columnName: string },
	conflictingTypes: JsonStatement['type'][],
	snapshot: PostgresSnapshot,
): string[] {
	const expandedFootprints: string[] = [];

	// For schemas - include all tables/views/enums/sequences in that schema
	if (statement.type === 'drop_schema' || statement.type === 'rename_schema') {
		const childEntities = findChildEntitiesInSchemaFromSnapshot(info.objectName, snapshot);
		for (const entity of childEntities) {
			for (const conflictType of conflictingTypes) {
				expandedFootprints.push(formatFootprint(conflictType, entity.schema, entity.objectName, entity.columnName));
			}
		}
	} // For tables - include all columns/indexes/constraints in that table
	else if (
		statement.type === 'drop_table' || statement.type === 'rename_table' || statement.type === 'recreate_table'
	) {
		const childEntities = findChildEntitiesInTableFromSnapshot(info.schema, info.objectName, snapshot);
		for (const entity of childEntities) {
			for (const conflictType of conflictingTypes) {
				expandedFootprints.push(formatFootprint(conflictType, entity.schema, entity.objectName, entity.columnName));
			}
		}
	}

	return expandedFootprints;
}

function findChildEntitiesInSchemaFromSnapshot(
	schemaName: string,
	snapshot: PostgresSnapshot,
): Array<{ schema: string; objectName: string; columnName: string }> {
	const entities: Array<{ schema: string; objectName: string; columnName: string }> = [];

	for (const entity of snapshot.ddl) {
		if (entity.entityType === 'tables' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.name, columnName: '' });
		} else if (entity.entityType === 'columns' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: entity.name });
		} else if (entity.entityType === 'views' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.name, columnName: '' });
		} else if (entity.entityType === 'enums' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.name, columnName: '' });
		} else if (entity.entityType === 'sequences' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.name, columnName: '' });
		} else if (entity.entityType === 'indexes' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.name, columnName: '' });
		} else if (entity.entityType === 'pks' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		} else if (entity.entityType === 'fks' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		} else if (entity.entityType === 'uniques' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		} else if (entity.entityType === 'checks' && entity.schema === schemaName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		}
	}

	return entities;
}

function findChildEntitiesInTableFromSnapshot(
	schemaName: string,
	tableName: string,
	snapshot: PostgresSnapshot,
): Array<{ schema: string; objectName: string; columnName: string }> {
	const entities: Array<{ schema: string; objectName: string; columnName: string }> = [];

	for (const entity of snapshot.ddl) {
		if (entity.entityType === 'columns' && entity.schema === schemaName && entity.table === tableName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: entity.name });
		} else if (entity.entityType === 'indexes' && entity.schema === schemaName && entity.table === tableName) {
			entities.push({ schema: entity.schema, objectName: entity.name, columnName: '' });
		} else if (entity.entityType === 'pks' && entity.schema === schemaName && entity.table === tableName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		} else if (entity.entityType === 'fks' && entity.schema === schemaName && entity.table === tableName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		} else if (entity.entityType === 'uniques' && entity.schema === schemaName && entity.table === tableName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		} else if (entity.entityType === 'checks' && entity.schema === schemaName && entity.table === tableName) {
			entities.push({ schema: entity.schema, objectName: entity.table, columnName: '' });
		}
	}

	return entities;
}

function findFootprintIntersections(
	branchAHashes: Array<{ hash: string; statement: JsonStatement; statementId: string }>,
	branchAConflicts: Array<{ hash: string; statement: JsonStatement; statementId: string }>,
	branchBHashes: Array<{ hash: string; statement: JsonStatement; statementId: string }>,
	branchBConflicts: Array<{ hash: string; statement: JsonStatement; statementId: string }>,
	leafAId: string,
	leafBId: string,
): string[] {
	const reasons: string[] = [];

	// Check if any statement hash from branch A intersects with conflict footprints from branch B
	for (const hashInfoA of branchAHashes) {
		for (const conflictInfoB of branchBConflicts) {
			if (hashInfoA.hash === conflictInfoB.hash) {
				reasons.push(
					`Statement conflict: Branch A statement ${hashInfoA.statementId} (${hashInfoA.statement.type}) `
						+ `conflicts with Branch B statement ${conflictInfoB.statementId} (${conflictInfoB.statement.type}) `
						+ `on resource: ${hashInfoA.hash} (A: ${leafAId}, B: ${leafBId})`,
				);
			}
		}
	}

	// Check if any statement hash from branch B intersects with conflict footprints from branch A
	for (const hashInfoB of branchBHashes) {
		for (const conflictInfoA of branchAConflicts) {
			if (hashInfoB.hash === conflictInfoA.hash) {
				reasons.push(
					`Statement conflict: Branch B statement ${hashInfoB.statementId} (${hashInfoB.statement.type}) `
						+ `conflicts with Branch A statement ${conflictInfoA.statementId} (${conflictInfoA.statement.type}) `
						+ `on resource: ${hashInfoB.hash} (A: ${leafAId}, B: ${leafBId})`,
				);
			}
		}
	}

	return reasons;
}

export const detectNonCommutative = async (
	snapshotsPaths: string[],
	dialect: Dialect,
): Promise<NonCommutativityReport> => {
	// temp solution for now, should remove it for other dialects
	if (dialect !== 'postgresql') {
		return { conflicts: [] };
	}

	const nodes = buildSnapshotGraph<PostgresSnapshot>(snapshotsPaths);

	const prevToChildren: Record<string, string[]> = {};
	for (const node of Object.values(nodes)) {
		const arr = prevToChildren[node.prevId] ?? [];
		arr.push(node.id);
		prevToChildren[node.prevId] = arr;
	}

	const conflicts: BranchConflict[] = [];

	// For each branching point (prevId with >1 children)
	for (const [prevId, childIds] of Object.entries(prevToChildren)) {
		if (childIds.length <= 1) continue;

		const parentNode = nodes[prevId];

		// For each child group, collect all leaf heads reachable from that child
		const childToLeaves: Record<string, string[]> = {};
		for (const childId of childIds) {
			childToLeaves[childId] = collectLeaves(nodes, childId);
		}

		// Precompute branch statements for each leaf from parent -> leaf
		const leafStatements: Record<string, { statements: JsonStatement[]; path: string }> = {};
		for (const leaves of Object.values(childToLeaves)) {
			for (const leafId of leaves) {
				const leafNode = nodes[leafId]!;
				const parentSnapshot = parentNode ? parentNode.raw : drySnapshot;
				const { statements } = await diffPostgres(parentSnapshot, leafNode.raw);
				leafStatements[leafId] = { statements, path: leafNode.folderPath };
			}
		}

		// Compare only across different initial children using footprint-based detection
		for (let i = 0; i < childIds.length; i++) {
			for (let j = i + 1; j < childIds.length; j++) {
				const groupA = childToLeaves[childIds[i]] ?? [];
				const groupB = childToLeaves[childIds[j]] ?? [];
				for (const aId of groupA) {
					for (const bId of groupB) {
						const aStatements = leafStatements[aId]!.statements;
						const bStatements = leafStatements[bId]!.statements;

						// Generate footprints for both branches using parent snapshot as the initial state
						const parentSnapshot = parentNode ? parentNode.raw : drySnapshot;
						const branchAFootprints = generateLeafFootprints(
							aStatements,
							getFolderNameFromNodeId(nodes[aId]),
							parentSnapshot,
						);
						const branchBFootprints = generateLeafFootprints(
							bStatements,
							getFolderNameFromNodeId(nodes[bId]),
							parentSnapshot,
						);

						// Find footprint intersections
						const reasons = findFootprintIntersections(
							branchAFootprints.statementHashes,
							branchAFootprints.conflictFootprints,
							branchBFootprints.statementHashes,
							branchBFootprints.conflictFootprints,
							aId,
							bId,
						);

						if (reasons.length > 0) {
							conflicts.push({
								parentId: prevId,
								parentPath: parentNode?.folderPath,
								branchA: { headId: aId, path: leafStatements[aId]!.path, statements: aStatements },
								branchB: { headId: bId, path: leafStatements[bId]!.path, statements: bStatements },
								reasons: reasons,
							});
						}
					}
				}
			}
		}
	}

	return { conflicts };
};

function buildSnapshotGraph<TSnapshot extends { id: string; prevId: string }>(
	snapshotFiles: string[],
): Record<string, SnapshotNode<TSnapshot>> {
	const byId: Record<string, SnapshotNode<TSnapshot>> = {};
	for (const file of snapshotFiles) {
		if (!existsSync(file)) continue;
		const raw = JSON.parse(readFileSync(file, 'utf8')) as TSnapshot;
		const node: SnapshotNode<TSnapshot> = {
			id: raw.id,
			prevId: raw.prevId,
			path: file,
			folderPath: dirname(file),
			raw,
		};
		byId[node.id] = node;
	}
	return byId;
}

function collectLeaves<TSnapshot extends { id: string; prevId: string }>(
	graph: Record<string, SnapshotNode<TSnapshot>>,
	startId: string,
): string[] {
	const leaves: string[] = [];
	const stack: string[] = [startId];
	// Build reverse edges prevId -> children lazily
	const prevToChildren: Record<string, string[]> = {};
	for (const node of Object.values(graph)) {
		const arr = prevToChildren[node.prevId] ?? [];
		arr.push(node.id);
		prevToChildren[node.prevId] = arr;
	}

	while (stack.length) {
		const id = stack.pop()!;
		const children = prevToChildren[id] ?? [];
		if (children.length === 0) {
			leaves.push(id);
		} else {
			for (const c of children) stack.push(c);
		}
	}
	return leaves;
}

async function diffPostgres(
	fromSnap: PostgresSnapshot | 'dry',
	toSnap: PostgresSnapshot,
): Promise<{ statements: JsonStatement[] }>;
async function diffPostgres(
	fromSnap: PostgresSnapshot,
	toSnap: PostgresSnapshot,
): Promise<{ statements: JsonStatement[] }>;
async function diffPostgres(fromSnap: any, toSnap: any): Promise<{ statements: JsonStatement[] }> {
	const fromDDL: PostgresDDL = createDDL();
	const toDDL: PostgresDDL = createDDL();

	if (fromSnap !== 'dry') {
		for (const e of fromSnap.ddl) fromDDL.entities.push(e);
	}
	for (const e of toSnap.ddl) toDDL.entities.push(e);

	const { statements } = await ddlDiffDry(fromDDL, toDDL, 'default');
	return { statements };
}
