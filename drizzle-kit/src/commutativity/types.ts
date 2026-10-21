export type MigrationNode = {
	id: string;
	path: string;
};

export type ConflictTarget = {
	kind: string;
	name: string;
	schema?: string;
	table?: string;
};

type ConflictingBranch = {
	chain: MigrationNode[];
	statementDescription: string;
	target: ConflictTarget;
	action: string;
	// The migration that holds the conflicting statement, which `fix-conflicts` removes. Only the postgres check
	// sets it, because the other dialects diff a whole branch and do not know the migration of a statement.
	source?: MigrationNode;
};

export type UnifiedBranchConflict = {
	parentId: string;
	parentPath?: string;
	branchA: ConflictingBranch;
	branchB: ConflictingBranch;
};

export type NonCommutativityReport = {
	conflicts: UnifiedBranchConflict[];
	leafNodes: string[];
	commutativeBranches?: {
		parentId: string;
		parentPath?: string;
		parentSnapshot: unknown;
		statements: unknown[];
		leafs: {
			id: string;
			path: string;
			statements: unknown[];
		}[];
	}[];
};
