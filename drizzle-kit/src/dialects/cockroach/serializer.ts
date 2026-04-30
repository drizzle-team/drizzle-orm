import { cockroachSchemaError, cockroachSchemaWarning } from '../../cli/views';
import { findLeafSnapshotIds } from '../../utils/utils-node';
import type { CockroachDDL } from './ddl';
import { createDDL, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { CockroachSnapshot } from './snapshot';
import { drySnapshot, snapshotValidator } from './snapshot';

export const prepareSnapshot = async (
	snapshots: string[],
	filenames: string[],
): Promise<{
	ddlPrev: CockroachDDL;
	ddlCur: CockroachDDL;
	snapshot: CockroachSnapshot;
	snapshotPrev: CockroachSnapshot;
	custom: CockroachSnapshot;
}> => {
	const { readFileSync } = await import('fs');
	const { randomUUID } = await import('crypto');
	const prevSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(
			JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()),
		);

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}

	const res = await prepareFromSchemaFiles(filenames);

	// TODO: do we want to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(
		res,
		() => true,
	);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => cockroachSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => cockroachSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors2.map((it) => cockroachSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const id = randomUUID();
	const prevIds = snapshots.length === 0 ? [prevSnapshot.id] : findLeafSnapshotIds(snapshots);

	const snapshot = {
		version: '1',
		dialect: 'cockroach',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies CockroachSnapshot;

	const {
		id: _ignoredId,
		prevIds: _ignoredPrevIds,
		...prevRest
	} = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: CockroachSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
