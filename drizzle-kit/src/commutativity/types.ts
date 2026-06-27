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

export type UnifiedBranchConflict = {
	parentId: string;
	parentPath?: string;
	branchA: {
		chain: MigrationNode[];
		statementDescription: string;
		target: ConflictTarget;
		action: string;
	};
	branchB: {
		chain: MigrationNode[];
		statementDescription: string;
		target: ConflictTarget;
		action: string;
	};
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
