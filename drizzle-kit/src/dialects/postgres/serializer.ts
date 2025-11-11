import type { CasingType } from '../../cli/validations/common';
import { postgresSchemaError, postgresSchemaWarning } from '../../cli/views';
import { prepareFilenames } from '../../utils/utils-node';
import type { PostgresDDL } from './ddl';
import { createDDL, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { PostgresSnapshot } from './snapshot';
import { drySnapshot, snapshotValidator } from './snapshot';

export const prepareSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<
	{
		ddlPrev: PostgresDDL;
		ddlCur: PostgresDDL;
		snapshot: PostgresSnapshot;
		snapshotPrev: PostgresSnapshot;
		custom: PostgresSnapshot;
	}
> => {
	const { readFileSync } = await import('fs');
	const { randomUUID } = await import('crypto');
	const prevSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()));

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}
	const filenames = prepareFilenames(schemaPath);

	const res = await prepareFromSchemaFiles(filenames);

	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(res, casing, () => true);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const id = randomUUID();
	const prevIds = [prevSnapshot.id];

	const snapshot = {
		version: '8',
		dialect: 'postgres',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies PostgresSnapshot;

	const { id: _ignoredId, prevIds: _ignoredPrevIds, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: PostgresSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
