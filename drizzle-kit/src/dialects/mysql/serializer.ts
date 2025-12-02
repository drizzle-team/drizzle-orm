import { mysqlSchemaError as schemaError } from 'src/cli/views';
import type { CasingType } from '../../cli/validations/common';
import { prepareFilenames } from '../../utils/utils-node';
import type { MysqlDDL, SchemaError } from './ddl';
import { createDDL, interimToDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { MysqlSnapshot } from './snapshot';
import { drySnapshot, snapshotValidator } from './snapshot';
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
		errors2: SchemaError[];
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
		res.views,
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
	if (errors2.length > 0) {
		console.log(errors2.map((it) => schemaError(it)).join('\n'));
		process.exit(1);
	}

	const id = randomUUID();
	const prevIds = [prevSnapshot.id];

	const snapshot = {
		version: '6',
		dialect: 'mysql',
		id,
		prevIds,
		ddl: ddlCur.entities.list(),
		renames: [],
	} satisfies MysqlSnapshot;

	const { id: _ignoredId, prevIds: _ignoredPrevIds, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: MysqlSnapshot = {
		id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom, errors2 };
};
