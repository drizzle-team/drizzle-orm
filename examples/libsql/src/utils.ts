export function aggregateOneToMany<
	TRow extends Record<string, any>,
	TOne extends keyof TRow,
	TMany extends keyof TRow,
>(
	rows: TRow[],
	one: TOne,
	many: TMany,
): { [K in TOne]: TRow[TOne] & { [K in TMany]: NonNullable<TRow[TMany]>[] } }[] {
	const map: Record<string, { one: TRow[TOne]; many: TRow[TMany][] }> = {};
	for (const row of rows) {
		const id = row[one];
		if (!map[id]) {
			map[id] = { one: row[one], many: [] };
		}
		map[id]!.many.push(row[many]);
	}
	return Object.values(map).map((r) => ({ ...r.one, [many]: r.many }));
}
