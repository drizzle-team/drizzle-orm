export class ConflictNeedsResolutionError extends Error {
	code = 'CONFLICT_NEEDS_RESOLUTION';
	stage: string;
	conflict: {
		created: any[];
		deleted: any[];
	};
	context?: {
		tableName?: string;
		schema?: string;
	};

	constructor(
		stage: string,
		conflict: { created: any[]; deleted: any[] },
		context?: { tableName?: string; schema?: string },
	) {
		super(`Conflict in ${stage} needs resolution`);
		this.stage = stage;
		this.conflict = conflict;
		this.context = context;
		Object.setPrototypeOf(this, ConflictNeedsResolutionError.prototype);
	}
}

export interface ResolutionDecision {
	created?: any[];
	deleted?: any[];
	renamed?: { from: any; to: any }[];
	moved?: { name: string; schemaFrom: string; schemaTo: string }[];
}

export interface ColumnsResolutionDecision {
	tableName: string;
	schema: string;
	created?: any[];
	deleted?: any[];
	renamed?: { from: any; to: any }[];
}

export interface AllDecisions {
	schemas?: ResolutionDecision;
	enums?: ResolutionDecision;
	sequences?: ResolutionDecision;
	roles?: ResolutionDecision;
	tables?: ResolutionDecision;
	columns?: ColumnsResolutionDecision[];
	policies?: Array<{
		tableName: string;
		schema: string;
		created?: any[];
		deleted?: any[];
		renamed?: { from: any; to: any }[];
	}>;
	indPolicies?: ResolutionDecision;
	views?: ResolutionDecision;
}

export const createThrowingResolverWithMoved = (
	decisions: AllDecisions | undefined,
	stage: string,
) => {
	return async (input: any) => {
		const decision = decisions?.[stage as keyof AllDecisions];

		if (!decision && input.created.length > 0 && input.deleted.length > 0) {
			throw new ConflictNeedsResolutionError(stage, {
				created: input.created,
				deleted: input.deleted,
			});
		}

		if (decision && !Array.isArray(decision)) {
			return {
				created: decision.created || [],
				deleted: decision.deleted || [],
				renamed: decision.renamed || [],
				moved: decision.moved || [],
			};
		}

		return {
			created: input.created,
			deleted: input.deleted,
			renamed: [],
			moved: [],
		};
	};
};

export const createThrowingResolver = (
	decisions: AllDecisions | undefined,
	stage: string,
) => {
	return async (input: any) => {
		const decision = decisions?.[stage as keyof AllDecisions];

		if (!decision && input.created.length > 0 && input.deleted.length > 0) {
			throw new ConflictNeedsResolutionError(stage, {
				created: input.created,
				deleted: input.deleted,
			});
		}

		if (decision && !Array.isArray(decision)) {
			return {
				created: decision.created || [],
				deleted: decision.deleted || [],
				renamed: decision.renamed || [],
			};
		}

		return {
			created: input.created,
			deleted: input.deleted,
			renamed: [],
		};
	};
};

export const createThrowingTableResolver = (
	decisions: AllDecisions | undefined,
	stage: string,
) => {
	return async (input: any) => {
		const decision = decisions?.[stage as keyof AllDecisions];
		let match;

		if (Array.isArray(decision)) {
			match = decision.find(
				(d: any) => d.tableName === input.tableName && d.schema === input.schema,
			);
		}

		if (!match && input.created.length > 0 && input.deleted.length > 0) {
			throw new ConflictNeedsResolutionError(
				stage,
				{
					created: input.created,
					deleted: input.deleted,
				},
				{
					tableName: input.tableName,
					schema: input.schema,
				},
			);
		}

		return {
			tableName: input.tableName,
			schema: input.schema,
			created: match?.created || input.created,
			deleted: match?.deleted || input.deleted,
			renamed: match?.renamed || [],
		};
	};
};
