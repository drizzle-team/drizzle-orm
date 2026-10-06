import { humanLog, postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import type { PostgresDDL } from './ddl';
import { interimToDDL } from './ddl';
import { fromDrizzleSchema } from './drizzle';
import type { PreparedPostgresSchema } from './drizzle';
import type { PostgresSnapshot } from './snapshot';
import { startingState } from './snapshot';

// The state that the next migration starts from: the state of the only leaf, or the combined state of
// several leaves. `prevIds` are the ids of the leaves.
export const previousState = async (snapshots: string[]): Promise<{ ddlPrev: PostgresDDL; prevIds: string[] }> => {
	const { readFileSync } = await import('fs');
	const history = new Map<string, PostgresSnapshot>();
	for (const path of snapshots) {
		const snapshot: PostgresSnapshot = JSON.parse(readFileSync(path, 'utf8'));
		history.set(snapshot.id, snapshot);
	}

	// `snapshots` is in folder-name order, so the first parent is the leaf with the newest folder name.
	const parentIds = new Set([...history.values()].flatMap((it) => it.prevIds));
	const prevIds = [...history.keys()].filter((id) => !parentIds.has(id)).reverse();
	return { ddlPrev: startingState(history, prevIds), prevIds };
};

export const prepareSnapshot = async (
	snapshots: string[],
	prepared: PreparedPostgresSchema,
): Promise<{
	ddlPrev: PostgresDDL;
	ddlCur: PostgresDDL;
	prevIds: string[];
}> => {
	const { ddlPrev, prevIds } = await previousState(snapshots);
	const res = prepared;

	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(
		res,
		() => true,
	);

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

	return { ddlPrev, ddlCur, prevIds };
};
