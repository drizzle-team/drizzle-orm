import type { Dialect } from './schemaValidator';

export const detectNonCommutative = async (
	snapshots: string[],
	dialect: Dialect,
) => {
	if (dialect === 'postgresql') {
		const { detectNonCommutative } = await import('../dialects/postgres/commutativity');
		return detectNonCommutative(snapshots);
	} else if (dialect === 'mysql') {
		const { detectNonCommutative } = await import('../dialects/mysql/commutativity');
		return detectNonCommutative(snapshots);
	} else {
		// assertUnreachable(dialect);
	}

	// temp
	return {} as any;
};
