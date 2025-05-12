import type { CasingType } from '../../cli/validations/common';
import { schemaError, schemaWarning } from '../../cli/views';
import { prepareFilenames } from '../../serializer';
import { createDDL, interimToDDL, MssqlDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import { drySnapshot, MssqlSnapshot, snapshotValidator } from './snapshot';

export const prepareSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<
	{
		ddlPrev: MssqlDDL;
		ddlCur: MssqlDDL;
		snapshot: MssqlSnapshot;
		snapshotPrev: MssqlSnapshot;
		custom: MssqlSnapshot;
	}
> => {
	const { readFileSync } = await import('fs') as typeof import('fs');
	const { randomUUID } = await import('crypto') as typeof import('crypto');
	const prevSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()));

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.insert(entry);
	}
	const filenames = prepareFilenames(schemaPath);

	const res = await prepareFromSchemaFiles(filenames);

	const schema = fromDrizzleSchema(res, casing);

	// TODO
	// if (warnings.length > 0) {
	// 	console.log(warnings.map((it) => schemaWarning(it)).join('\n\n'));
	// }

	// if (errors.length > 0) {
	// 	console.log(errors.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	// TODO
	// if (errors2.length > 0) {
	// 	console.log(errors2.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

	const id = randomUUID();
	const prevId = prevSnapshot.id;

	const snapshot = {
		version: '1',
		dialect: 'mssql',
		id,
		prevId,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies MssqlSnapshot;

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: MssqlSnapshot = {
		id,
		prevId,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
