import { cockroachSchemaError, cockroachSchemaWarning, humanLog } from '../../cli/views';
import type { SchemaMetadata } from '../utils';
import type { CockroachDDL } from './ddl';
import { interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import { type CockroachMigrationsFolder, combinedState } from './folder';

// Converts a cockroach schema to its state. generate and export both call it, so they agree on what the schema
// is. `stage` names the step that gave the errors, and `ddl` is null when `fromDrizzleSchema` fails.
export const stateOfSchema = (prepared: Awaited<ReturnType<typeof prepareFromSchemaFiles>>) => {
	// TODO: do we want to export everything or ignore .existing and respect entity filters in config
	const { schema, metadata, errors, warnings } = fromDrizzleSchema(prepared, () => true);
	if (errors.length > 0) return { stage: 'schema' as const, ddl: null, metadata, errors, warnings };
	const { ddl, errors: ddlErrors } = interimToDDL(schema);
	return { stage: 'ddl' as const, ddl, metadata, errors: ddlErrors, warnings };
};

export const prepareSnapshot = async (
	migrations: CockroachMigrationsFolder,
	filenames: string[],
): Promise<{
	ddlPrev: CockroachDDL;
	ddlCur: CockroachDDL;
	metadata: SchemaMetadata;
}> => {
	const ddlPrev = combinedState(migrations);
	const { ddl: ddlCur, metadata, errors, warnings } = stateOfSchema(await prepareFromSchemaFiles(filenames));

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => cockroachSchemaWarning(it)).join('\n\n'));
	}

	if (!ddlCur || errors.length > 0) {
		humanLog(errors.map((it) => cockroachSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return { ddlPrev, ddlCur, metadata };
};
