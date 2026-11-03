import { SchemaFilesNotFoundCliError } from '../cli/errors';

// A warning that `check` reports about the schema. `schema_changed` and `merge_needed` mean that generate would
// write SQL. `not_compared` means that `check` could not compare the schema.
export type CheckWarning = { kind: 'schema_changed' | 'merge_needed' | 'not_compared'; message: string };

// Compares the schema with a migrations folder that already passed `check`, and returns the warnings for the `ok`
// result of `check`. The schema matches the folder when generate would write no SQL. A schema problem must not
// fail `check`, so every failure here becomes a `not_compared` warning.
export const schemaWarnings = async <TState>(options: {
	// The combined state of the leaves of the folder.
	currentState: () => TState;
	// The folder names of the leaves.
	leafFolders: () => string[];
	// Loads the schema and converts it to a state. `ddl` is null when the schema has errors.
	loadSchema: () => Promise<{ ddl: TState | null; errors: unknown[] }>;
	diff: (from: TState, to: TState) => Promise<{ sqlStatements: string[] }>;
}): Promise<CheckWarning[]> => {
	const notCompared = (reason: string): CheckWarning[] => [{
		kind: 'not_compared',
		message: `The schema was not compared with the migrations, because ${reason}`,
	}];
	const explain = 'Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write';
	try {
		const { ddl: ddlCur, errors } = await options.loadSchema();
		if (!ddlCur || errors.length > 0) {
			return notCompared('the schema has errors. Run drizzle-kit generate to see them.');
		}

		const { sqlStatements } = await options.diff(options.currentState(), ddlCur);
		if (sqlStatements.length === 0) return [];

		const leaves = options.leafFolders();
		if (leaves.length === 0) {
			return [{
				kind: 'schema_changed',
				message: 'The migrations folder has no migration, and the schema is not empty. '
					+ 'Run drizzle-kit generate to write the first migration.',
			}];
		}
		if (leaves.length === 1) {
			return [{
				kind: 'schema_changed',
				message: `The schema differs from the migrations. The newest migration is ${leaves[0]}. `
					+ `${explain} a migration for it.`,
			}];
		}
		return [{
			kind: 'merge_needed',
			message: `The migrations folder has ${leaves.length} branches that are not merged: ${leaves.join(', ')}. `
				+ `The schema differs from their combined state, so a merge migration is needed. ${explain} the `
				+ 'merge migration.',
		}];
	} catch (e) {
		if (e instanceof SchemaFilesNotFoundCliError) {
			return notCompared(
				`no schema file matches ${(e.meta!.paths as string[]).join(', ')}. `
					+ 'Correct the schema path in the config file or in the --schema option.',
			);
		}
		return notCompared(
			'the comparison failed with an error. Run drizzle-kit generate to see whether it fails in the same way. '
				+ `The error: ${(e as Error).message}`,
		);
	}
};
