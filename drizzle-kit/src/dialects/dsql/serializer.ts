import type { CasingType } from '../../cli/validations/common';
import { dsqlSchemaError, dsqlSchemaWarning } from '../../cli/views';
import { prepareFilenames } from '../../utils/utils-node';
import type { PostgresDDL } from '../postgres/ddl';
import { createDDL, interimToDDL } from '../postgres/ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from './drizzle';
import type { DSQLSnapshot } from './snapshot';
import { drySnapshot, snapshotValidator, toJsonSnapshot } from './snapshot';

/**
 * Prepares snapshot for DSQL generate command.
 *
 * DSQL uses PostgreSQL's DDL structures since it outputs PostgreSQL-compatible SQL.
 * This function:
 * 1. Loads the previous snapshot (if any)
 * 2. Loads schema files using DSQL's prepareFromSchemaFiles()
 * 3. Converts to InterimSchema using DSQL's fromDrizzleSchema()
 * 4. Converts to DDL using postgres/interimToDDL()
 */
export const prepareSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<
	{
		ddlPrev: PostgresDDL;
		ddlCur: PostgresDDL;
		snapshot: DSQLSnapshot;
		snapshotPrev: DSQLSnapshot;
		custom: DSQLSnapshot;
	}
> => {
	const { readFileSync } = await import('fs');

	// Load previous snapshot or use empty snapshot
	const prevSnapshot = snapshots.length === 0
		? drySnapshot
		: snapshotValidator.strict(JSON.parse(readFileSync(snapshots[snapshots.length - 1]).toString()));

	// Convert previous snapshot to DDL
	const ddlPrev = createDDL();
	for (const entry of prevSnapshot.ddl) {
		ddlPrev.entities.push(entry);
	}

	// Load schema files
	const filenames = prepareFilenames(schemaPath);
	const res = await prepareFromSchemaFiles(filenames);

	// Convert DSQL schema to interim schema format
	const { schema, errors, warnings } = fromDrizzleSchema(res, casing, () => true);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => dsqlSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => dsqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	// Convert interim schema to DDL
	const { ddl: ddlCur, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors2.map((it) => dsqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const prevIds = [prevSnapshot.id];

	// Create snapshot using DSQL snapshot format
	const snapshot = toJsonSnapshot(ddlCur, prevIds, []);

	const { id: _ignoredId, prevIds: _ignoredPrevIds, ...prevRest } = prevSnapshot;

	// Custom snapshot for custom migrations
	const custom: DSQLSnapshot = {
		id: snapshot.id,
		prevIds,
		...prevRest,
	};

	return { ddlPrev, ddlCur, snapshot, snapshotPrev: prevSnapshot, custom };
};
