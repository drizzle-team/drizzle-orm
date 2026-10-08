import { CheckCliError } from '../../cli/errors';
import { humanLog, postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import type { PostgresDDL } from './ddl';
import { interimToDDL } from './ddl';
import { fromDrizzleSchema } from './drizzle';
import type { PreparedPostgresSchema } from './drizzle';
import { KeyCollisionError, reconstruct, reconstructErrorMessage, startingState } from './reconstruct';
import type { PostgresSnapshot } from './snapshot';

// The state that the next migration starts from: the state of the only leaf, or the combined state of
// several leaves. `prevIds` are the ids of the leaves.
export const previousState = async (snapshots: string[]): Promise<{ ddlPrev: PostgresDDL; prevIds: string[] }> => {
	const { readFileSync } = await import('fs');
	const { basename, dirname } = await import('path');
	const history = new Map<string, PostgresSnapshot>();
	const pathOf = new Map<string, string>();
	for (const path of snapshots) {
		const snapshot: PostgresSnapshot = JSON.parse(readFileSync(path, 'utf8'));
		history.set(snapshot.id, snapshot);
		pathOf.set(snapshot.id, path);
	}

	// `snapshots` is in folder-name order, so the first parent is the leaf with the newest folder name.
	const parentIds = new Set([...history.values()].flatMap((it) => it.prevIds));
	const prevIds = [...history.keys()].filter((id) => !parentIds.has(id)).reverse();
	const folderOf = (id: string) => basename(dirname(pathOf.get(id)!));
	// `id` is the snapshot to restore or delete, and `problem` is a full sentence.
	const malformed = (id: string, problem: string) =>
		new CheckCliError('malformed', reconstructErrorMessage(folderOf(id), problem), { snapshot: pathOf.get(id)! });
	// Every leaf is reconstructed as a separate state. The combined state applies the deltas of the other
	// leaves to the state of the first parent, so it alone can hide a leaf that does not reconstruct.
	const leaves = prevIds.map((id) => {
		try {
			return reconstruct(history, id);
		} catch (e) {
			throw malformed(id, `Cannot reconstruct the state of migration ${folderOf(id)}: ${(e as Error).message}`);
		}
	});
	if (leaves.length === 1) return { ddlPrev: leaves[0], prevIds };
	try {
		return { ddlPrev: startingState(history, prevIds), prevIds };
	} catch (e) {
		// Every leaf reconstructs, so the delta that throws is one that another parent brings into the merge.
		if (!(e instanceof KeyCollisionError) || !e.snapshotId) throw e;
		throw malformed(
			e.snapshotId,
			`Cannot reconstruct the combined state at migration ${folderOf(e.snapshotId)}: ${e.message}`,
		);
	}
};

// The state that a drizzle schema describes. generate, export and check use this one conversion, so they
// agree on what the schema is. `ddl` is null when the schema has errors of the first stage.
export const stateOfSchema = (prepared: PreparedPostgresSchema) => {
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(prepared, () => true);
	if (errors.length > 0) return { stage: 'schema' as const, ddl: null, errors, warnings };
	const { ddl, errors: ddlErrors } = interimToDDL(schema);
	return { stage: 'ddl' as const, ddl, errors: ddlErrors, warnings };
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
	const { ddl: ddlCur, errors, warnings } = stateOfSchema(prepared);

	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (!ddlCur || errors.length > 0) {
		humanLog(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return { ddlPrev, ddlCur, prevIds };
};
