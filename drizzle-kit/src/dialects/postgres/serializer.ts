import type { CheckHandlerResult } from '../../cli/commands/check';
import { humanLog, postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import type { PostgresDDL } from './ddl';
import { interimToDDL } from './ddl';
import { fromDrizzleSchema } from './drizzle';
import type { PreparedPostgresSchema } from './drizzle';
import type { PostgresSnapshot } from './snapshot';
import { reconstruct, startingState } from './snapshot';

export const prepareSnapshot = async (
	snapshots: string[],
	prepared: PreparedPostgresSchema,
	checkResult?: CheckHandlerResult,
): Promise<{
	ddlPrev: PostgresDDL;
	ddlCur: PostgresDDL;
	ddlSqlFrom: PostgresDDL;
	prevIds: string[];
}> => {
	const { readFileSync } = await import('fs');
	const history = new Map<string, PostgresSnapshot>();
	for (const path of snapshots) {
		const snapshot: PostgresSnapshot = JSON.parse(readFileSync(path, 'utf8'));
		history.set(snapshot.id, snapshot);
	}

	// `snapshots` is in folder-name order, so the first parent is the leaf with the newest folder name.
	const ids = [...history.keys()];
	const leafIds = checkResult?.leafIds ?? [];
	const prevIds = leafIds.length > 1 ? ids.filter((id) => leafIds.includes(id)).reverse() : ids.slice(-1);
	const ddlPrev = startingState(history, prevIds);
	// With ignored conflicts the SQL starts from the newest leaf, so it can repeat other branches' changes.
	const ddlSqlFrom = checkResult?.hasConflicts ? reconstruct(history, prevIds[0]) : ddlPrev;
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

	return { ddlPrev, ddlCur, ddlSqlFrom, prevIds };
};
