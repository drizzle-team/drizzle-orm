import type { CasingType } from '../../cli/validations/common';
import { prepareFilenames } from '../../utils/utils-node';
import { createDDL, interimToDDL, type MysqlDDL } from '../mysql/ddl';
import { drySnapshot, type SingleStoreSnapshot, snapshotValidator } from '../singlestore/snapshot';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';

export const prepareSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<
	{
		ddlPrev: MysqlDDL;
		ddlCur: MysqlDDL;
		snapshot: SingleStoreSnapshot;
		snapshotPrev: SingleStoreSnapshot;
		custom: SingleStoreSnapshot;
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

	const interim = fromDrizzleSchema(
		res.tables,
		casing,
	);

	// TODO: errors
	// if (warnings.length > 0) {
	// 	console.log(warnings.map((it) => schemaWarning(it)).join('\n\n'));
	// }

	// if (errors.length > 0) {
	// 	console.log(errors.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

	const { ddl: ddlCur, errors: _errors2 } = interimToDDL(interim);

	// TODO: handle errors
	// if (errors2.length > 0) {
	// 	console.log(errors2.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

	const id = randomUUID();
	const prevIds = [prevSnapshot.id];

	const snapshot = {
		version: '2',
		dialect: 'singlestore',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies SingleStoreSnapshot;

	const { id: _ignoredId, prevIds: _ignoredPrevIds, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: SingleStoreSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
