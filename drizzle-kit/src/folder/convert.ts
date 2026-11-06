import type { Footprint } from '../commutativity/engine';
import type { Resolver } from '../dialects/common';
import { type DDL, type Delta, findRow, parseEntityKey, type Row } from '../dialects/dialect';
import { originUUID } from '../utils';
import { mockResolver } from '../utils/mocks';
import { deltaFormatValidators, type DeltaSnapshot } from './delta-format';
import { applyDeltas, KeyCollisionError, startingState } from './reconstruct';

export { deltaFormatValidators };

type State = Pick<DDL, 'entities' | 'key' | '_'>;

type NamedEntity = { name: string; table?: string; schema?: string };

const nameOf = (row: Row) => [row.schema, row.table, row.name].filter(Boolean).join('.');

// Gives the resolver that `convertFolder` passes to the diff for every entity type, because an old rename
// string does not say which entity type it renames. Each call keeps the strings whose old name is in `deleted`
// and whose new name is in `created`, because `mockResolver` throws when it finds the old name without the new
// one.
export const renameResolverFromStrings = (renames: string[]) =>
<T extends NamedEntity>(
	it: Parameters<Resolver<T>>[0],
): ReturnType<Resolver<T>> => {
	const deleted = new Set(it.deleted.map(nameOf));
	const created = new Set(it.created.map(nameOf));
	const own = renames.filter((rename) => {
		const [from, to] = rename.split('->');
		return deleted.has(from) && created.has(to);
	});
	return mockResolver<T>(new Set(own))(it);
};

// The resolver type that a dialect's diff takes for each entity type of an old snapshot.
export type RenameResolver = <T extends NamedEntity>(it: Parameters<Resolver<T>>[0]) => ReturnType<Resolver<T>>;

// Turns the rename deltas of an old migration into rename decisions for a diff, one set per entity type, so
// that a column rename never matches an index or a table. It applies `deltas` to `state` in place.
export const renameResolverFromDeltas = (state: State, deltas: Delta[]) => {
	const renames = new Map<string, Set<string>>();
	for (const it of deltas) {
		if (it.op === 'rename') {
			const [type] = parseEntityKey(it.key);
			const row = findRow(state, it.key);
			if (row) {
				renames.set(
					type,
					(renames.get(type) ?? new Set()).add(
						`${nameOf(row)}->${nameOf({ ...row, ...it.set })}`,
					),
				);
			}
		}
		applyDeltas(state, [it]);
	}
	return <T extends NamedEntity>(type: string): Resolver<T> => mockResolver<T>(renames.get(type) ?? new Set());
};

// An old snapshot that `convertFolder` reads: the full state, the parents and the renames of its migration.
// A snapshot that is already in the new format has no `ddl`, and `isConverted` keeps it as it is.
export type OldSnapshot<TRow> = {
	id: string;
	prevIds: string[];
	version: string;
	ddl?: TRow[];
	renames?: string[];
};

export type ConversionDialect<
	TVersion extends string,
	TDialect extends string,
	TRow extends Row,
	TState extends State,
	TOldSnapshot extends OldSnapshot<TRow>,
> = {
	version: TVersion;
	dialect: TDialect;
	emptyState: () => TState;
	fromEntities: (entities: TRow[]) => TState;
	// The rows that a converted snapshot stores as its full state.
	snapshotDdl: (state: TState) => TRow[];
	clone: (state: TState) => TState;
	// Gives the rows that the conversion writes for an old snapshot, with the generated names that the state
	// holds. Postgres fixes the names of primary keys here; most dialects return the rows as they are.
	normalizeRows: (rows: TRow[], state: TState) => TRow[];
	deltasBetween: (from: TState, to: TState) => Delta[];
	diff: (from: TState, to: TState, renameResolver: RenameResolver) => Promise<Delta[]>;
	footprintsOfDeltas: (start: TState, deltas: Delta[]) => Promise<Footprint[]>;
	// A snapshot of the format that the conversion writes is kept as it is.
	isConverted: (snapshot: TOldSnapshot) => boolean;
};

// Thrown when the branches of an old merge gave one name to two different entities. The combined state of such
// a merge cannot be reconstructed.
export class UnsupportedMergeError extends Error {
	constructor(readonly folder: string, cause: KeyCollisionError) {
		super(`the merge in migration ${folder} cannot be reconstructed. ${cause.message}`, { cause });
	}
}

// Converts the snapshots of a migrations folder to the delta format. `files` must be in folder-name order.
// Every converted snapshot is built from the states of the snapshots that come before it, so a merge starts
// from the combined state of its parents.
export const convertFolder = async <
	TVersion extends string,
	TDialect extends string,
	TRow extends Row,
	TState extends State,
	TOldSnapshot extends OldSnapshot<TRow>,
>(
	files: { folder: string; snapshot: TOldSnapshot }[],
	description: ConversionDialect<TVersion, TDialect, TRow, TState, TOldSnapshot>,
): Promise<DeltaSnapshot<TRow, TVersion, TDialect>[]> => {
	const folderOf = new Map(files.map((it) => [it.snapshot.id, it.folder]));
	const converted = new Map<string, DeltaSnapshot<TRow, TVersion, TDialect>>();
	for (const { snapshot } of files) {
		if (description.isConverted(snapshot)) {
			converted.set(snapshot.id, snapshot as unknown as DeltaSnapshot<TRow, TVersion, TDialect>);
			continue;
		}
		const header = { version: description.version, dialect: description.dialect, id: snapshot.id } as const;
		const parents = snapshot.prevIds.filter((id) => id && id !== originUUID);
		if (parents.length === 0) {
			const state = description.fromEntities(snapshot.ddl ?? []);
			const creates: Delta[] = state.entities.list().map((row) => ({ op: 'create', row }));
			converted.set(snapshot.id, {
				type: 'base',
				...header,
				prevIds: [originUUID],
				footprints: await description.footprintsOfDeltas(description.emptyState(), creates),
				ddl: description.snapshotDdl(state),
			});
			continue;
		}
		// `prevIds` puts the parent with the newest folder name first, as generate does for a merge.
		const prevIds = [...parents].sort((a, b) => (folderOf.get(a)! > folderOf.get(b)! ? -1 : 1));
		let start: TState;
		try {
			start = startingState(converted, prevIds, description.fromEntities);
		} catch (e) {
			if (e instanceof KeyCollisionError) throw new UnsupportedMergeError(folderOf.get(snapshot.id)!, e);
			throw e;
		}
		// `diff` changes both states that it gets, so `from` and `to` must not share rows with `start` or with
		// `snapshot.ddl`.
		const from = description.clone(start);
		const to = description.fromEntities(structuredClone(snapshot.ddl ?? []));
		const deltas = await description.diff(from, to, renameResolverFromStrings(snapshot.renames ?? []));
		// The diff keeps the names of the starting state. The extra deltas restore the names that the file
		// stores, because the two can differ after a table rename or in a merge.
		deltas.push(
			...description.deltasBetween(to, description.fromEntities(description.normalizeRows(snapshot.ddl ?? [], to))),
		);
		converted.set(snapshot.id, {
			type: 'diff',
			...header,
			prevIds,
			footprints: await description.footprintsOfDeltas(start, deltas),
			deltas,
		});
	}
	return files.map((it) => converted.get(it.snapshot.id)!);
};
