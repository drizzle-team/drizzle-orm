import type { Resolver } from '../../dialects/common';

/**
 * Given the list of renames from a forward diff (from -> to),
 * this constructs a resolver for the reverse diff that knows about those renames.
 * In the reverse diff, 'to' names appear in `deleted` and 'from' names in `created`.
 */
function invertRenames<T extends { name: string }>(
	forwardRenames: { from: T; to: T }[],
	inputCreated: T[],
	inputDeleted: T[],
): { renamedOrMoved: { from: T; to: T }[]; created: T[]; deleted: T[] } {
	const created = [...inputCreated];
	const deleted = [...inputDeleted];
	const renamedOrMoved: { from: T; to: T }[] = [];
	for (const { from, to } of forwardRenames) {
		const delIdx = deleted.findIndex((d) => d.name === to.name);
		const creIdx = created.findIndex((c) => c.name === from.name);
		if (delIdx !== -1 && creIdx !== -1) {
			renamedOrMoved.push({ from: deleted[delIdx]!, to: created[creIdx]! });
			deleted.splice(delIdx, 1);
			created.splice(creIdx, 1);
		}
	}
	return { renamedOrMoved, created, deleted };
}

/**
 * Wraps a resolver to capture renames during the forward diff.
 */
export function withCapture<T extends { name: string; schema?: string; table?: string }>(
	resolver: Resolver<T>,
	store: { from: T; to: T }[],
): Resolver<T> {
	return async (input) => {
		const result = await resolver(input);
		store.push(...result.renamedOrMoved);
		return result;
	};
}

/**
 * Creates a resolver for the reverse diff that inverts the captured forward renames.
 */
export function makeInverseResolver<T extends { name: string; schema?: string; table?: string }>(
	renames: { from: T; to: T }[],
): Resolver<T> {
	return async (input) => {
		return invertRenames(renames, input.created, input.deleted);
	};
}
