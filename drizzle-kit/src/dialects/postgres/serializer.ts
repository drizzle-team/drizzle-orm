import { humanLog, postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import type { PostgresDDL } from './ddl';
import { interimToDDL } from './ddl';
import { fromDrizzleSchema } from './drizzle';
import type { PreparedPostgresSchema } from './drizzle';
import { combinedState, type MigrationsFolder } from './folder';

// The state that a drizzle schema describes. generate, export and check use this one conversion, so they
// agree on what the schema is. `ddl` is null when the schema has errors of the first stage.
export const stateOfSchema = (prepared: PreparedPostgresSchema) => {
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(prepared, () => true);
	if (errors.length > 0) return { stage: 'schema' as const, ddl: null, errors, warnings };
	const { ddl, errors: ddlErrors } = interimToDDL(schema);
	return { stage: 'ddl' as const, ddl, errors: ddlErrors, warnings };
};

export const prepareSnapshot = (
	migrations: MigrationsFolder,
	prepared: PreparedPostgresSchema,
): {
	ddlPrev: PostgresDDL;
	ddlCur: PostgresDDL;
} => {
	const ddlPrev = combinedState(migrations);
	const { ddl: ddlCur, errors, warnings } = stateOfSchema(prepared);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (!ddlCur || errors.length > 0) {
		humanLog(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return { ddlPrev, ddlCur };
};
