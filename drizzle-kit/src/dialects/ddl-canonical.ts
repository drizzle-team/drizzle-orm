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

/**
 * Turns the entities of a state into sorted strings, so that two states with the same entities give equal
 * results. The order of the entities and of their fields does not change the result. The order inside an
 * array changes the result, because it has a meaning for `enum.values` and `index.columns`.
 */
export const normalizeDDL = (rows: Row[]): string[] => rows.map((e) => JSON.stringify(canonical(e))).sort();
