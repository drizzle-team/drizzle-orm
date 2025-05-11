import type { CasingType } from '../../cli/validations/common';
import { schemaError, schemaWarning } from '../../cli/views';
import { prepareFilenames } from '../../serializer';
import { createDDL, interimToDDL, MysqlDDL } from '../mysql/ddl';
import { drySnapshot, MysqlSnapshot, snapshotValidator } from '../mysql/snapshot';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';

export const prepareSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<
	{
		ddlPrev: MysqlDDL;
		ddlCur: MysqlDDL;
		snapshot: MysqlSnapshot;
		snapshotPrev: MysqlSnapshot;
		custom: MysqlSnapshot;
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

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(interim);

	// TODO: handle errors
	// if (errors2.length > 0) {
	// 	console.log(errors2.map((it) => schemaError(it)).join('\n'));
	// 	process.exit(1);
	// }

	const id = randomUUID();
	const prevId = prevSnapshot.id;

	const snapshot = {
		version: '5',
		dialect: 'mysql',
		id,
		prevId,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies MysqlSnapshot;

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: MysqlSnapshot = {
		id,
		prevId,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
