import { originUUID } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { type Delta, delta, findRow, parseEntityKey } from '../dialect';
import { createDDL, fromEntities, type PostgresDDL, type PostgresEntities, type PostgresEntity } from './ddl';
import { ddlDiff } from './diff';
import { defaultNameForPK } from './grammar';
import { applyDeltas, KeyCollisionError, startingState } from './reconstruct';
import type { PostgresSnapshot, PostgresSnapshotV8 } from './snapshot';
import type { SnapshotStatement } from './snapshot-statements';

const nameOf = (row: { schema?: string; table?: string; name?: string }) =>
	[row.schema, row.table, row.name].filter(Boolean).join('.');

// Gives the resolver that `upToV9` passes to `ddlDiff` for every entity type, because a format 8 rename string
// does not say which entity type it renames. Each call keeps the strings whose old name is in `deleted` and
// whose new name is in `created`, because `mockResolver` throws when it finds the old name without the new one.
const format8RenameResolver = (renames: string[]) =>
<T extends { name: string; table?: string; schema?: string }>(
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

// Gives the rows of a format 8 file with the primary key names that the database has. Postgres keeps the
// name <table>_pkey when a table is renamed, and drizzle-kit 0.x wrote no SQL for the key. A converted 0.x
// file names such a key after the new table, so the key takes its name from `state`. A composite key of 0.x
// keeps its stored name, because 0.x dropped it and added it under the new name.
export const withStateKeyNames = (rows: PostgresEntity[], state: PostgresDDL): PostgresEntity[] =>
	rows.map((row) => {
		if (row.entityType !== 'pks' || row.nameExplicit || row.name !== defaultNameForPK(row.table)) return row;
		const key = state.pks.one({ schema: row.schema, table: row.table });
		return key ? { ...row, name: key.name } : row;
	});

// Turns the rename deltas into rename decisions for `ddlDiff`, one set per entity type, so that a column
// rename never matches an index or a table. It also applies `deltas` to `state` in place.
const resolversOfRenameDeltas = (state: PostgresDDL, deltas: Delta[]) => {
	const renames = new Map<string, Set<string>>();
	for (const it of deltas) {
		if (it.op === 'rename') {
			const [type] = parseEntityKey(it.key);
			const row = findRow(state, it.key);
			if (row) {
				renames.set(type, (renames.get(type) ?? new Set()).add(`${nameOf(row)}->${nameOf({ ...row, ...it.set })}`));
			}
		}
		applyDeltas(state, [it]);
	}
	// `privileges` is excluded, because a privilege has no name and so has no rename decision.
	return <K extends Exclude<keyof PostgresEntities, 'privileges'>>(type: K): Resolver<PostgresEntities[K]> =>
		mockResolver<PostgresEntities[K]>(renames.get(type) ?? new Set());
};

// Builds the `statements` of a converted snapshot from its starting state `start` and its `deltas`. The rename
// deltas become the rename decisions. `keepGeneratedNames` is false, so a drop and a create of a constraint
// stay two statements, as in the SQL that drizzle-kit wrote for the migration.
const statementsOf = async (start: PostgresDDL, deltas: Delta[]): Promise<SnapshotStatement[]> => {
	// `ddlDiff` changes both states that it gets, so `from` and `to` are separate clones of `start`.
	const from = start.clone();
	const to = start.clone();
	const resolverOf = resolversOfRenameDeltas(to, deltas);
	const { snapshotStatements } = await ddlDiff(
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
	return snapshotStatements;
};

// Thrown by `upToV9` when the branches of an old merge gave one name to two different entities. The combined
// state of such a merge cannot be reconstructed.
export class UnsupportedMergeError extends Error {
	constructor(readonly folder: string, cause: KeyCollisionError) {
		super(`the merge in migration ${folder} cannot be reconstructed. ${cause.message}`, { cause });
	}
}

// Converts the snapshots of a migrations folder to format 9 for `up`. `files` must be in folder-name order.
// The function is not in versions.ts, because it loads diff.ts. The programmatic API imports versions.ts at
// module load, and the API must load diff.ts only inside its functions.
export const upToV9 = async (
	files: { folder: string; snapshot: PostgresSnapshotV8 | PostgresSnapshot }[],
): Promise<PostgresSnapshot[]> => {
	const folderOf = new Map(files.map((it) => [it.snapshot.id, it.folder]));
	const converted = new Map<string, PostgresSnapshot>();
	for (const { snapshot } of files) {
		if (snapshot.version === '9') {
			converted.set(snapshot.id, snapshot);
			continue;
		}
		const header = { version: '9', dialect: 'postgres', id: snapshot.id } as const;
		const parents = snapshot.prevIds.filter((id) => id && id !== originUUID);
		if (parents.length === 0) {
			const state = fromEntities(snapshot.ddl);
			const creates: Delta[] = state.entities.list().map((row) => ({ op: 'create', row }));
			converted.set(snapshot.id, {
				type: 'base',
				...header,
				prevIds: [originUUID],
				statements: await statementsOf(createDDL(), creates),
				ddl: state.entities.list(),
			});
			continue;
		}
		// `prevIds` puts the parent with the newest folder name first, as generate does for a merge.
		const prevIds = [...parents].sort((a, b) => (folderOf.get(a)! > folderOf.get(b)! ? -1 : 1));
		let start: PostgresDDL;
		try {
			start = startingState(converted, prevIds);
		} catch (e) {
			if (e instanceof KeyCollisionError) throw new UnsupportedMergeError(folderOf.get(snapshot.id)!, e);
			throw e;
		}
		// `ddlDiff` changes both states that it gets, so `from` and `to` must not share rows with `start` or with
		// `snapshot.ddl`.
		const from = start.clone();
		const to = fromEntities(structuredClone(snapshot.ddl));
		const renameResolver = format8RenameResolver(snapshot.renames ?? []);
		const { deltas } = await ddlDiff(
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
		);
		// `delta(to, ...)` restores the generated constraint names that the file stores, because `ddlDiff` keeps
		// the names of the starting state. The two names can differ after a table rename or in a merge. A primary
		// key keeps the name that `withStateKeyNames` takes from `to`.
		deltas.push(...delta(to, fromEntities(withStateKeyNames(snapshot.ddl, to))));
		converted.set(snapshot.id, {
			type: 'diff',
			...header,
			prevIds,
			statements: await statementsOf(start, deltas),
			deltas,
		});
	}
	return files.map((it) => converted.get(it.snapshot.id)!);
};
