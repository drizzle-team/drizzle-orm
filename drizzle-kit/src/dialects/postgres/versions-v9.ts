import { originUUID } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { copyDDL, type Delta, delta, findRow, splitDeltaKey } from '../dialect';
import { createDDL, fromEntities, type PostgresDDL, type PostgresEntities, type PostgresEntity } from './ddl';
import { ddlDiff } from './diff';
import { defaultNameForPK } from './grammar';
import { applyDeltas, KeyCollisionError, startingState } from './reconstruct';
import type { PostgresSnapshot, PostgresSnapshotV8 } from './snapshot';
import type { SnapshotStatement } from './snapshot-statements';

const nameOf = (row: { schema?: string; table?: string; name?: string }) =>
	[row.schema, row.table, row.name].filter(Boolean).join('.');

// A format 8 rename string does not say which kind of entity it renames, so every resolver gets all of
// them. A resolver keeps only the strings whose old name is among its dropped rows and whose new name
// is among its created rows, because mockResolver throws when it finds the old name without the new one.
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

// Postgres names a primary key <table>_pkey when it creates the table and keeps that name when the table is
// renamed. drizzle-kit 0.x wrote no SQL for the key then, but its files, converted to format 8, name the key after
// the new table. Such a key keeps the name that `state` has. A composite key from 0.x keeps its stored name,
// because 0.x dropped it and added it under the new name.
export const withStateKeyNames = (rows: PostgresEntity[], state: PostgresDDL): PostgresEntity[] =>
	rows.map((row) => {
		if (row.entityType !== 'pks' || row.nameExplicit || row.name !== defaultNameForPK(row.table)) return row;
		const key = state.pks.one({ schema: row.schema, table: row.table });
		return key ? { ...row, name: key.name } : row;
	});

// Applies `deltas` to `state` in place and turns their renames into rename decisions, one set per
// entity type, so that a column rename never matches an index or a table.
const resolversOfRenameDeltas = (state: PostgresDDL, deltas: Delta[]) => {
	const renames = new Map<string, Set<string>>();
	for (const it of deltas) {
		if (it.op === 'rename') {
			const [type] = splitDeltaKey(it.key);
			const row = findRow(state, it.key);
			if (row) {
				renames.set(type, (renames.get(type) ?? new Set()).add(`${nameOf(row)}->${nameOf({ ...row, ...it.set })}`));
			}
		}
		applyDeltas(state, [it]);
	}
	// A privilege has no name, so it has no rename decision.
	return <K extends Exclude<keyof PostgresEntities, 'privileges'>>(type: K): Resolver<PostgresEntities[K]> =>
		mockResolver<PostgresEntities[K]>(renames.get(type) ?? new Set());
};

// The statements of a migration that starts from the state `start` and applies `deltas`. The rename deltas
// are the rename decisions. Generated names are not kept, so a drop and a create of a constraint in the
// deltas stay a drop and a create statement, as in the SQL that drizzle-kit wrote for the migration.
const statementsOf = async (start: PostgresDDL, deltas: Delta[]): Promise<SnapshotStatement[]> => {
	// ddlDiff changes both states that it gets, so each one is a separate copy.
	const from = copyDDL(start);
	const to = copyDDL(start);
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
		false,
	);
	return snapshotStatements;
};

// An old merge whose branches gave one name to two different entities. Its combined state cannot be reconstructed.
export class UnsupportedMergeError extends Error {
	constructor(readonly folder: string, cause: KeyCollisionError) {
		super(`the merge in migration ${folder} cannot be reconstructed. ${cause.message}`, { cause });
	}
}

// This step loads diff.ts, so it is not in versions.ts. The programmatic API imports versions.ts at module
// load, and the API must load diff.ts only inside its functions. `files` must be in folder-name order.
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
		// The first parent of a merge is the one with the newest folder name.
		const prevIds = [...parents].sort((a, b) => (folderOf.get(a)! > folderOf.get(b)! ? -1 : 1));
		let start: PostgresDDL;
		try {
			start = startingState(converted, prevIds);
		} catch (e) {
			if (e instanceof KeyCollisionError) throw new UnsupportedMergeError(folderOf.get(snapshot.id)!, e);
			throw e;
		}
		// ddlDiff changes both states that it gets, so neither may share rows with a file.
		const from = copyDDL(start);
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
		// ddlDiff gives a constraint with a generated name the name that it has in the starting state. A
		// format 5-8 file can store another generated name, for example after a table rename or in a merge.
		// Drops and creates at the end restore the stored names, except for the primary key names that
		// withStateKeyNames takes from the state.
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
