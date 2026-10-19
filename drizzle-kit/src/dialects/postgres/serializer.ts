import { humanLog, postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import type { SchemaMetadata } from '../utils';
import type { PostgresDDL } from './ddl';
import { interimToDDL } from './ddl';
import { fromDrizzleSchema } from './drizzle';
import type { PreparedPostgresSchema } from './drizzle';
import { combinedState, type MigrationsFolder } from './folder';

export const prepareSnapshot = (
	migrations: MigrationsFolder,
	prepared: PreparedPostgresSchema,
): {
	ddlPrev: PostgresDDL;
	ddlCur: PostgresDDL;
	metadata: SchemaMetadata;
} => {
	const ddlPrev = combinedState(migrations);

	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, metadata, errors, warnings } = fromDrizzleSchema(prepared, () => true);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		humanLog(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		humanLog(errors2.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return { ddlPrev, ddlCur, metadata };
};
