export type MigrationNode = {
	id: string;
	path: string;
};

export type UnifiedBranchConflict = {
	parentId: string;
	parentPath?: string;
	branchA: {
		chain: MigrationNode[];
		statementDescription: string;
	};
	branchB: {
		chain: MigrationNode[];
		statementDescription: string;
	};
};

export type NonCommutativityReport = {
	conflicts: UnifiedBranchConflict[];
	leafNodes: string[];
	commutativeBranches?: {
		parentId: string;
		parentPath?: string;
		parentSnapshot: unknown;
		leafs: {
			id: string;
			path: string;
			statements: unknown[];
		}[];
	}[];
};
