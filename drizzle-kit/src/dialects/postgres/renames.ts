import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { applyInPlace, type Delta, findRow, splitDeltaKey } from '../dialect';
import type { PostgresDDL } from './ddl';

const nameOf = (row: { schema?: string; table?: string; name?: string }) =>
	[row.schema, row.table, row.name].filter(Boolean).join('.');

// Applies `deltas` to `state` in place and turns their renames into rename decisions, one set per
// entity type, so that a column rename never matches an index or a table. A relocate follows the
// rename of another entity, so it is not a decision.
// If `canSkipDecisions` is true, a decision whose new name the diff does not create is dropped. This
// happens when a merge with ignored conflicts starts from a combined state that already has the name.
export const renameResolvers = (state: PostgresDDL, deltas: Delta[], canSkipDecisions = false) => {
	const renames = new Map<string, Set<string>>();
	for (const delta of deltas) {
		if (delta.op === 'rename') {
			const [type] = splitDeltaKey(delta.key);
			const row = findRow(state, delta.key);
			if (row) {
				renames.set(type, (renames.get(type) ?? new Set()).add(`${nameOf(row)}->${nameOf({ ...row, ...delta.set })}`));
			}
		}
		applyInPlace(state, [delta]);
	}
	return <T extends { name: string; table?: string; schema?: string }>(type: string): Resolver<T> => (input) => {
		const decisions = [...renames.get(type) ?? []];
		const created = new Set(input.created.map(nameOf));
		const accepted = canSkipDecisions
			? decisions.filter((decision) => created.has(decision.split('->')[1]))
			: decisions;
		return mockResolver<T>(new Set(accepted))(input);
	};
};
