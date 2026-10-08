import { ddlDiffDry } from '../../dialects/postgres/diff';
import type { SchemaSource } from '../../dialects/postgres/drizzle';
import { combinedState, leafFolders, type MigrationsFolder } from '../../dialects/postgres/folder';
import { stateOfSchema } from '../../dialects/postgres/serializer';
import { SchemaFilesNotFoundCliError } from '../errors';

// `schema_changed` and `merge_needed` mean that generate would write SQL. `not_compared` means that check
// could not tell.
export type CheckWarning = { kind: 'schema_changed' | 'merge_needed' | 'not_compared'; message: string };

// What `check` says about a schema that differs from the migrations folder. The folder already passed the
// check, so it is valid and its branches do not conflict. The schema equals the migrations when generate
// would write no SQL. Nothing is written. No failure here may fail check, so a schema that cannot be
// compared is a warning too.
export const schemaWarnings = async (
	stored: MigrationsFolder,
	schemaSource: SchemaSource,
): Promise<CheckWarning[]> => {
	const notCompared = (reason: string): CheckWarning[] => [{
		kind: 'not_compared',
		message: `The schema was not compared with the migrations, because ${reason}`,
	}];
	const explain = 'Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write';
	try {
		const { ddl: ddlCur, errors } = stateOfSchema(await schemaSource.load());
		if (!ddlCur || errors.length > 0) {
			return notCompared('the schema has errors. Run drizzle-kit generate to see them.');
		}

		const { sqlStatements } = await ddlDiffDry(combinedState(stored), ddlCur, 'default');
		if (sqlStatements.length === 0) return [];

		const leaves = leafFolders(stored);
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
