import type { Footprint } from '../../commutativity/engine';
import { convertFolder, type RenameResolver, renameResolverFromDeltas } from '../../folder/convert';
import { type Delta, delta } from '../dialect';
import { footprintsOf } from './commutativity';
import { type CockroachDDL, type CockroachEntity, createDDL, fromEntities } from './ddl';
import { ddlDiff } from './diff';
import type { CockroachSnapshot, CockroachSnapshotV1 } from './snapshot';

// Builds the `footprints` of a converted snapshot from its starting state `start` and its `deltas`. The rename
// deltas become the rename decisions. `ddlDiff` changes both states that it gets, so `from` and `to` are separate
// clones of `start`.
const footprintsOfDeltas = async (start: CockroachDDL, deltas: Delta[]): Promise<Footprint[]> => {
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
		resolverOf('tables'),
		resolverOf('columns'),
		resolverOf('views'),
		resolverOf('indexes'),
		resolverOf('checks'),
		resolverOf('pks'),
		resolverOf('fks'),
		'default',
	);
	return footprintsOf(groupedStatements);
};

// Converts the snapshots of a migrations folder to format 2 for `up`. `files` must be in folder-name order.
export const upToV2 = async (
	files: { folder: string; snapshot: CockroachSnapshotV1 | CockroachSnapshot }[],
): Promise<CockroachSnapshot[]> =>
	convertFolder(files, {
		version: '2',
		dialect: 'cockroach',
		emptyState: createDDL,
		fromEntities,
		snapshotDdl: (state: CockroachDDL) => state.entities.list(),
		clone: (state: CockroachDDL) => state.clone(),
		// Cockroach snapshots store the names that their SQL left in the database, so a converted snapshot needs
		// no name correction.
		normalizeRows: (rows: CockroachEntity[]) => rows,
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
				'default',
			)).deltas,
		footprintsOfDeltas,
		isConverted: (snapshot) => snapshot.version === '2',
	});
