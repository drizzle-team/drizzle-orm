import type { CasingType } from 'src/cli/validations/common';
import { schemaError, schemaWarning } from '../../cli/views';
import { prepareFilenames } from '../../serializer';
import { createDDL, interimToDDL, PostgresDDL } from './ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import { drySnapshot, PostgresSnapshot, snapshotValidator } from './snapshot';

export const preparePostgresMigrationSnapshot = async (
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
	const { readFileSync } = await import('fs') as typeof import('fs');
	const { randomUUID } = await import('crypto') as typeof import('crypto');
	const prevSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(readFileSync(snapshots[snapshots.length - 1]).toJSON());

	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.insert(entry);
	}
	const filenames = prepareFilenames(schemaPath);

	const res = await prepareFromSchemaFiles(filenames);

	const { schema, errors, warnings } = fromDrizzleSchema(
		res.schemas,
		res.tables,
		res.enums,
		res.sequences,
		res.roles,
		res.policies,
		res.views,
		res.matViews,
		casing,
	);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => schemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => schemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors.map((it) => schemaError(it)).join('\n'));
		process.exit(1);
	}

	const id = randomUUID();
	const prevId = prevSnapshot.id;

	const snapshot = {
		version: '8',
		dialect: 'postgres',
		id,
		prevId,
		ddl: ddlCur.entities.list(),
		meta: null,
	} satisfies PostgresSnapshot;

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: PostgresSnapshot = {
		id,
		prevId,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
