import type { CasingType } from 'src/cli/validations/common';
import { sqliteSchemaError } from '../../cli/views';
import { prepareFilenames } from '../../serializer';
import { createDDL, interimToDDL, SQLiteDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSqliteSchemaFiles } from './drizzle';
import { drySqliteSnapshot, snapshotValidator, SqliteSnapshot } from './snapshot';

export const prepareSqliteMigrationSnapshot = async (
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
	const { readFileSync } = await import('fs') as typeof import('fs');
	const { randomUUID } = await import('crypto') as typeof import('crypto');
	const prevSnapshot = snapshots.length === 0
		? drySqliteSnapshot
		: snapshotValidator.strict(readFileSync(snapshots[snapshots.length - 1]).toJSON());

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.insert(entry);
	}
	const filenames = prepareFilenames(schemaPath);

	const { tables, views } = await prepareFromSqliteSchemaFiles(filenames);
	const interim = fromDrizzleSchema(tables, views, casing);

	const { ddl: ddlCur, errors } = interimToDDL(interim);

	if (errors.length > 0) {
		console.log(errors.map((it) => sqliteSchemaError(it)).join('\n\n'));
		process.exit();
	}

	const id = randomUUID();
	const prevId = prevSnapshot.id;

	const snapshot = {
		version: '7',
		dialect: 'sqlite',
		id,
		prevId,
		ddl: ddlCur.entities.list(),
		meta: null,
	} satisfies SqliteSnapshot;

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: SqliteSnapshot = {
		id,
		prevId,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
