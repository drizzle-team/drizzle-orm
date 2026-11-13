export interface UpgradeResult {
	newDb: boolean;
}

export const GET_VERSION_FOR = {
	mysql: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	pg: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	effect: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	mssql: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	cockroach: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	singlestore: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
	sqlite: (columns: string[]): number => {
		if (columns.includes('name')) return 1;
		return 0;
	},
} as const;
