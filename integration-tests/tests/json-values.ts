const date = new Date('2025-03-12T01:32:41.623Z');

export const jsonValues: { value: unknown; expected?: unknown }[] = [
	{ value: null },
	{ value: { str: 'strval', arr: ['str', 10] } },
	{ value: {} },
	{ value: { nested: { deep: [1, { key: null }] } } },
	{ value: [{ key: 'value', num: 7 }, 'v', '11', 5] },
	{ value: [] },
	{ value: ['str', 1] },
	{ value: [1, 'str'] },
	{ value: [true, 1] },
	{ value: [[false], [1, 'str']] },
	{ value: 5 },
	{ value: 0 },
	{ value: -2.25 },
	{ value: 9007199254740991 },
	{ value: 'strval' },
	{ value: '' },
	{ value: '5' },
	{ value: '{"key":"value"}' },
	{ value: 'with "quote", \\ backslash\nand newline' },
	{ value: 'unісоde 🚀' }, // non-latin letters are used on purpose
	{ value: true },
	{ value: false },
	{ value: date, expected: '2025-03-12T01:32:41.623Z' },
	{ value: [date, 1], expected: ['2025-03-12T01:32:41.623Z', 1] },
	{ value: { at: date }, expected: { at: '2025-03-12T01:32:41.623Z' } },
	{ value: Buffer.from('ab'), expected: { type: 'Buffer', data: [97, 98] } },
	{ value: new Uint8Array([97, 98]), expected: { 0: 97, 1: 98 } },
];

export const jsonRows = <TColumn extends string, TArrayColumn extends string = never>(
	columns: TColumn[],
	arrayColumns: TArrayColumn[] = [],
) => {
	type Row = { id: number } & Record<TColumn, unknown> & Record<TArrayColumn, unknown[] | null>;
	const rows = (pick: (entry: (typeof jsonValues)[number]) => unknown) =>
		jsonValues.map((entry, id) => {
			const value = pick(entry);
			return {
				id,
				...Object.fromEntries(columns.map((column) => [column, value])),
				...Object.fromEntries(arrayColumns.map((column) => [column, value === null ? null : [value]])),
			} as Row;
		});

	return {
		input: rows((entry) => entry.value),
		output: rows((entry) => 'expected' in entry ? entry.expected : entry.value),
	};
};

/** Parses json text the database stores - text of a value stringified twice parses into a string instead of the value */
export const parseStoredJson = (rows: Record<string, unknown>[]) =>
	rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, text]) => [key, typeof text === 'string' ? JSON.parse(text) : text]),
		)
	);
