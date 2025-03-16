import { randomUUID } from 'crypto';
import type { CasingType } from './cli/validations/common';
import { originUUID } from './global';
import { prepareFromExports } from './serializer/pgImports';
import type { PgSchema as PgSchemaKit } from './dialects/postgres/ddl';
import { generatePgSnapshot } from './serializer/pgSerializer';
import type { SchemaError, SchemaWarning } from './utils';
import { drizzleToInternal } from './serializer/pgDrizzleSerializer';

export const generatePostgresDrizzleJson = (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
	casing?: CasingType,
):
	| { status: 'ok'; schema: PgSchemaKit; warnings: SchemaWarning[] }
	| {
		status: 'error';
		errors: SchemaError[];
		warnings: SchemaWarning[];
	} =>
{
	const prepared = prepareFromExports(imports);

	const id = randomUUID();
	const { schema, errors, warnings } = drizzleToInternal(
		prepared.tables,
		prepared.enums,
		prepared.schemas,
		prepared.sequences,
		prepared.roles,
		prepared.policies,
		prepared.views,
		prepared.matViews,
		casing,
		schemaFilters,
	);

	if (errors.length > 0) {
		return {
			status: 'error',
			errors,
			warnings,
		};
	}

	const snapshot = generatePgSnapshot(
		schema,
	);

	return {
		status: 'ok',
		schema: {
			...snapshot,
			id,
			prevId: prevId ?? originUUID,
		},
		warnings,
	};
};
