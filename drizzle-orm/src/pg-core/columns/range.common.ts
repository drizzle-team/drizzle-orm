export interface PgRange<T> {
	lower: T | null;
	upper: T | null;
	lowerInc: boolean;
	upperInc: boolean;
	empty: boolean;
}

export function parseRange<T>(value: string, parse: (s: string) => T): PgRange<T> {
	const trimmed = value.trim();

	if (trimmed === 'empty') {
		return { lower: null, upper: null, lowerInc: false, upperInc: false, empty: true };
	}

	const lowerInc = trimmed[0] === '[';
	const upperInc = trimmed[trimmed.length - 1] === ']';

	const inner = trimmed.slice(1, -1);
	const commaIdx = inner.indexOf(',');
	const lowerStr = inner.slice(0, commaIdx).trim();
	const upperStr = inner.slice(commaIdx + 1).trim();

	const lower = lowerStr === '' ? null : parse(lowerStr);
	const upper = upperStr === '' ? null : parse(upperStr);

	return { lower, upper, lowerInc, upperInc, empty: false };
}

export function serializeRange<T>(range: PgRange<T>, serialize: (v: T) => string): string {
	if (range.empty) {
		return 'empty';
	}

	const lowerBracket = range.lowerInc ? '[' : '(';
	const upperBracket = range.upperInc ? ']' : ')';
	const lower = range.lower === null ? '' : serialize(range.lower);
	const upper = range.upper === null ? '' : serialize(range.upper);

	return `${lowerBracket}${lower},${upper}${upperBracket}`;
}
