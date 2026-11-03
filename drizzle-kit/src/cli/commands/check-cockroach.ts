import { ddlDiffDry } from '../../dialects/cockroach/diff';
import { prepareFromSchemaFiles } from '../../dialects/cockroach/drizzle';
import { type CockroachMigrationsFolder, combinedState, leafFolders } from '../../dialects/cockroach/folder';
import { stateOfSchema } from '../../dialects/cockroach/serializer';
import { type CheckWarning, schemaWarnings as sharedSchemaWarnings } from '../../folder/check-schema';

// Compares a cockroach schema with a migrations folder that already passed `check`.
export const schemaWarnings = (
	stored: CockroachMigrationsFolder,
	filenames: string[],
): Promise<CheckWarning[]> =>
	sharedSchemaWarnings({
		currentState: () => combinedState(stored),
		leafFolders: () => leafFolders(stored),
		loadSchema: async () => stateOfSchema(await prepareFromSchemaFiles(filenames)),
		diff: (from, to) => ddlDiffDry(from, to, 'default'),
	});
