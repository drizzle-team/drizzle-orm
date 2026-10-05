import { originUUID } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { apply, copyDDL, type Delta, delta, KeyCollisionError } from '../dialect';
import { createDDL, fromEntities, type PostgresDDL, type PostgresEntity } from './ddl';
import { ddlDiff } from './diff';
import { defaultNameForPK } from './grammar';
import { renameResolvers } from './renames';
import { type PostgresSnapshot, type PostgresSnapshotV8, startingState, stateHash } from './snapshot';
import type { JsonStatement } from './statements';

// A format 8 rename string does not say which kind of entity it renames, so every resolver gets all of
// them. A resolver keeps only the strings whose old name is among its dropped rows and whose new name
// is among its created rows, because mockResolver throws when it finds the old name without the new one.
const renamesResolver = (renames: string[]) =>
<T extends { name: string; table?: string; schema?: string }>(
	it: Parameters<Resolver<T>>[0],
): ReturnType<Resolver<T>> => {
	const nameOf = (row: T) => [row.schema, row.table, row.name].filter(Boolean).join('.');
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

// The statements of a migration that starts from the state `start` and applies `deltas`. The rename deltas
// are the rename decisions. Generated names are not kept, so a drop and a create of a constraint in the
// deltas stay a drop and a create statement, as in the SQL that drizzle-kit wrote for the migration.
const statementsOf = async (start: PostgresDDL, deltas: Delta[]): Promise<JsonStatement[]> => {
	// ddlDiff changes both states that it gets, so each one is a separate copy.
	const from = copyDDL(start);
	const to = copyDDL(start);
	const resolver = renameResolvers(to, deltas);
	const { statements } = await ddlDiff(
		from,
		to,
		resolver('schemas'),
		resolver('enums'),
		resolver('sequences'),
		resolver('policies'),
		resolver('roles'),
		resolver('tables'),
		resolver('columns'),
		resolver('views'),
		resolver('uniques'),
		resolver('indexes'),
		resolver('checks'),
		resolver('pks'),
		resolver('fks'),
		'default',
		false,
	);
	return statements;
};

// An old merge whose branches gave one name to two different entities. Its combined state cannot be rebuilt.
export class UnsupportedMergeError extends Error {
	constructor(readonly folder: string, cause: KeyCollisionError) {
		super(`the merge in migration ${folder} cannot be rebuilt. ${cause.message}`, { cause });
	}
}

// This step is not in versions.ts. The programmatic API imports versions.ts at module load, and it must
// load snapshot.ts only inside its functions. `files` must be in folder-name order.
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
				stateHash: stateHash(state),
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
		const resolve = renamesResolver(snapshot.renames ?? []);
		const { deltas } = await ddlDiff(
			from,
			to,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
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
			stateHash: stateHash(apply(start, deltas)),
		});
	}
	return files.map((it) => converted.get(it.snapshot.id)!);
};
