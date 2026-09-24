/**
 * Canonical, order-independent serialization of a ddl state — for comparing two states and
 * for the snapshot integrity fingerprint. Object key order is normalised; array order is
 * kept (it is semantic for `enum.values` / `index.columns`). Two states are equal iff their
 * `normalizeDDL()`s are deep-equal.
 *
 * Deliberately NOT part of the engine (`./dialect`): `delta`/`apply` never need it. Canonical
 * form is a concern of whoever compares or persists ddl states — the snapshot layer and its
 * tests — not of the Dialect itself.
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
