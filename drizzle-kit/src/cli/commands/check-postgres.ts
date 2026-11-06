import { ddlDiffDry } from '../../dialects/postgres/diff';
import type { SchemaSource } from '../../dialects/postgres/drizzle';
import { combinedState, leafFolders, type MigrationsFolder } from '../../dialects/postgres/folder';
import { stateOfSchema } from '../../dialects/postgres/serializer';
import { type CheckWarning, schemaWarnings as sharedSchemaWarnings } from '../../folder/check-schema';

export type { CheckWarning };

// Compares a postgres schema with a migrations folder that already passed `check`.
export const schemaWarnings = (stored: MigrationsFolder, schemaSource: SchemaSource): Promise<CheckWarning[]> =>
	sharedSchemaWarnings({
		currentState: () => combinedState(stored),
		leafFolders: () => leafFolders(stored),
		loadSchema: async () => stateOfSchema(await schemaSource.load()),
		diff: (from, to) => ddlDiffDry(from, to, 'default'),
	});
