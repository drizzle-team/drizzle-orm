import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { type Delta, findRow, splitDeltaKey } from '../dialect';
import type { PostgresDDL, PostgresEntities } from './ddl';
import { applyDeltas } from './reconstruct';

const nameOf = (row: { schema?: string; table?: string; name?: string }) =>
	[row.schema, row.table, row.name].filter(Boolean).join('.');

// Applies `deltas` to `state` in place and turns their renames into rename decisions, one set per
// entity type, so that a column rename never matches an index or a table.
export const renameResolvers = (state: PostgresDDL, deltas: Delta[]) => {
	const renames = new Map<string, Set<string>>();
	for (const delta of deltas) {
		if (delta.op === 'rename') {
			const [type] = splitDeltaKey(delta.key);
			const row = findRow(state, delta.key);
			if (row) {
				renames.set(type, (renames.get(type) ?? new Set()).add(`${nameOf(row)}->${nameOf({ ...row, ...delta.set })}`));
			}
		}
		applyDeltas(state, [delta]);
	}
	// A privilege has no name, so it has no rename decision.
	return <K extends Exclude<keyof PostgresEntities, 'privileges'>>(type: K): Resolver<PostgresEntities[K]> =>
		mockResolver<PostgresEntities[K]>(renames.get(type) ?? new Set());
};
