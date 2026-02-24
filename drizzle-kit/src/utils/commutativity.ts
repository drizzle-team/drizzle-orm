import type { Dialect } from './schemaValidator';

/** A single migration node in a chain from parent to leaf. */
export type MigrationNode = {
	id: string;
	path: string; // folder path (human-readable migration name)
};

/** A branch conflict with full chain info and human-readable statement descriptions. */
export type UnifiedBranchConflict = {
	parentId: string;
	parentPath?: string;
	branchA: {
		chain: MigrationNode[]; // ordered: first child after parent → ... → leaf
		statementDescription: string; // e.g. "add_column on users.email"
	};
	branchB: {
		chain: MigrationNode[];
		statementDescription: string;
	};
};

/** Dialect-agnostic return type for detectNonCommutative. */
export type NonCommutativityReport = {
	conflicts: UnifiedBranchConflict[];
	leafNodes: string[]; // IDs of all leaf nodes (terminal nodes with no children)
};

export const detectNonCommutative = async (
	snapshots: string[],
	dialect: Dialect,
): Promise<NonCommutativityReport> => {
	if (dialect === 'postgresql') {
		const { detectNonCommutative } = await import('../dialects/postgres/commutativity');
		return detectNonCommutative(snapshots);
	} else if (dialect === 'mysql') {
		const { detectNonCommutative } = await import('../dialects/mysql/commutativity');
		return detectNonCommutative(snapshots);
	}

	return { conflicts: [], leafNodes: [] };
};
