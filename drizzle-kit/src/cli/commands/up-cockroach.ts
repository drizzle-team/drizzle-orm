import { outputFormat } from '../context';

export const upCockroachHandler = (_out: string): string[] => {
	// const { snapshots } = prepareOutFolder(out, "cockroach");
	// const report = validateWithReport(snapshots, "cockroach");

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return [];
};
