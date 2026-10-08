import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { type Delta, findRow, splitDeltaKey } from '../dialect';
import type { PostgresDDL } from './ddl';
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
	return <T extends { name: string; table?: string; schema?: string }>(type: string): Resolver<T> =>
		mockResolver<T>(renames.get(type) ?? new Set());
};
