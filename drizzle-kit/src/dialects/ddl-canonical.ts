/**
 * The canonical form of a state, which does not depend on the order of the entities or of their fields.
 * The order of an array is kept, because it has a meaning for `enum.values` and `index.columns`. Two
 * states are equal when their `normalizeDDL()` results are deep-equal.
 *
 * It is not part of the engine (`./dialect`), because no engine function needs it.
 */
type Row = Record<string, any>;

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Row).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, canonical(v)]),
		);
	}
	return value;
}

export const normalizeDDL = (rows: Row[]): string[] => rows.map((e) => JSON.stringify(canonical(e))).sort();
