import type { CasingType } from 'src/cli/validations/common';
import { sqliteSchemaError } from '../../cli/views';
import { prepareFilenames } from '../../utils/utils-node';
import type { SQLiteDDL } from './ddl';
import { createDDL, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { SqliteSnapshot } from './snapshot';
import { drySqliteSnapshot, snapshotValidator } from './snapshot';

export const prepareSqliteSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<
	{
		ddlPrev: SQLiteDDL;
		ddlCur: SQLiteDDL;
		snapshot: SqliteSnapshot;
		snapshotPrev: SqliteSnapshot;
		custom: SqliteSnapshot;
	}
> => {
	const { readFileSync } = await import('fs');
	const { randomUUID } = await import('crypto');
	const prevSnapshot = snapshots.length === 0
		? drySqliteSnapshot
		: snapshotValidator.strict(JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()));

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}
	const filenames = prepareFilenames(schemaPath);

	const { tables, views } = await prepareFromSchemaFiles(filenames);
	const interim = fromDrizzleSchema(tables, views, casing);

	const { ddl: ddlCur, errors } = interimToDDL(interim);

	if (errors.length > 0) {
		console.log(errors.map((it) => sqliteSchemaError(it)).join('\n\n'));
		process.exit();
	}

	const id = randomUUID();
	const prevIds = [prevSnapshot.id];

	const snapshot = {
		version: '7',
		dialect: 'sqlite',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies SqliteSnapshot;

	const { id: _ignoredId, prevIds: _ignoredPrevIds, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: SqliteSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
