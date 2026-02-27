import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { PostgresSchema } from './mocks';
import { drizzleToDDL } from './mocks';

type SchemaState = PostgresSchema;

const originId = '00000000-0000-0000-0000-000000000000';

function ddlFromSchema(schema: SchemaState): PostgresSnapshot['ddl'] {
	return drizzleToDDL(schema).ddl.entities.list();
}

export function snapshotFromSchema(
	id: string,
	schema: SchemaState,
	prevIds: string[] = [originId],
): PostgresSnapshot {
	return {
		version: '8',
		dialect: 'postgres',
		id,
		prevIds,
		ddl: ddlFromSchema(schema),
		renames: [],
	};
}

export function expectedSnapshotFromSchema(
	baseSnapshot: PostgresSnapshot,
	schema: SchemaState,
): PostgresSnapshot {
	return {
		...baseSnapshot,
		ddl: ddlFromSchema(schema),
	};
}
