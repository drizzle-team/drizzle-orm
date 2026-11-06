import type { Footprint } from '../../commutativity/engine';
import {
	convertFolder,
	type RenameResolver,
	renameResolverFromDeltas,
	UnsupportedMergeError,
} from '../../folder/convert';
import { type Delta, delta } from '../dialect';
import { footprintsOf } from './commutativity';
import { createDDL, fromEntities, type PostgresDDL, type PostgresEntity } from './ddl';
import { ddlDiff } from './diff';
import { defaultNameForPK } from './grammar';
import type { PostgresSnapshot, PostgresSnapshotV8 } from './snapshot';

export { UnsupportedMergeError };

// Gives the rows of a format 8 file with the primary key names that the database has. Postgres keeps the name
// <table>_pkey when a table is renamed, and drizzle-kit 0.x wrote no SQL for the key. A converted 0.x file names
// such a key after the new table, so the key takes its name from `state`. A composite key of 0.x keeps its stored
// name, because 0.x dropped it and added it under the new name.
export const withStateKeyNames = (rows: PostgresEntity[], state: PostgresDDL): PostgresEntity[] =>
	rows.map((row) => {
		if (row.entityType !== 'pks' || row.nameExplicit || row.name !== defaultNameForPK(row.table)) return row;
		const key = state.pks.one({ schema: row.schema, table: row.table });
		return key ? { ...row, name: key.name } : row;
	});

// Builds the `footprints` of a converted snapshot from its starting state `start` and its `deltas`. The rename
// deltas become the rename decisions. `keepGeneratedNames` is false, so a drop and a create of a constraint
// stay two footprints, as in the SQL that drizzle-kit wrote for the migration.
const footprintsOfDeltas = async (start: PostgresDDL, deltas: Delta[]): Promise<Footprint[]> => {
	// `ddlDiff` changes both states that it gets, so `from` and `to` are separate clones of `start`.
	const from = start.clone();
	const to = start.clone();
	const resolverOf = renameResolverFromDeltas(to, deltas);
	const { groupedStatements } = await ddlDiff(
		from,
		to,
		resolverOf('schemas'),
		resolverOf('enums'),
		resolverOf('sequences'),
		resolverOf('policies'),
		resolverOf('roles'),
		resolverOf('tables'),
		resolverOf('columns'),
		resolverOf('views'),
		resolverOf('uniques'),
		resolverOf('indexes'),
		resolverOf('checks'),
		resolverOf('pks'),
		resolverOf('fks'),
		'default',
		undefined,
		false,
	);
	return footprintsOf(groupedStatements);
};

// Converts the snapshots of a migrations folder to format 9 for `up`. `files` must be in folder-name order.
// The function is not in versions.ts, because it loads diff.ts. The programmatic API imports versions.ts at
// module load, and the API must load diff.ts only inside its functions.
export const upToV9 = async (
	files: { folder: string; snapshot: PostgresSnapshotV8 | PostgresSnapshot }[],
): Promise<PostgresSnapshot[]> =>
	convertFolder(files, {
		version: '9',
		dialect: 'postgres',
		emptyState: createDDL,
		fromEntities,
		snapshotDdl: (state) => state.entities.list(),
		clone: (state) => state.clone(),
		normalizeRows: withStateKeyNames,
		deltasBetween: (from, to) => delta(from, to),
		diff: async (from, to, renameResolver: RenameResolver) =>
			(await ddlDiff(
				from,
				to,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				renameResolver,
				'default',
			)).deltas,
		footprintsOfDeltas,
		isConverted: (snapshot) => snapshot.version === '9',
	});
