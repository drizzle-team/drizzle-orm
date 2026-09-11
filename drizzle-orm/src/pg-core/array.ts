const DEFAULT_DELIM = ',';

function parsePgArrayValue(
	arrayString: string,
	startFrom: number,
	inQuotes: boolean,
	delim: string,
): [string, number] {
	for (let i = startFrom; i < arrayString.length; i++) {
		const char = arrayString[i];

		if (char === '\\') {
			i++;
			continue;
		}

		if (char === '"') {
			return [arrayString.slice(startFrom, i).replace(/\\(.)/g, '$1'), i + 1];
		}

		if (inQuotes) {
			continue;
		}

		if (char === delim || char === '}') {
			return [arrayString.slice(startFrom, i).replace(/\\(.)/g, '$1'), i];
		}
	}

	return [arrayString.slice(startFrom).replace(/\\(.)/g, '$1'), arrayString.length];
}

export function parsePgNestedArray(arrayString: string, startFrom = 0, delim = DEFAULT_DELIM): [any[], number] {
	const result: any[] = [];
	let i = startFrom;
	let lastCharIsDelim = false;

	while (i < arrayString.length) {
		const char = arrayString[i];

		if (char === delim) {
			if (lastCharIsDelim || i === startFrom) {
				result.push('');
			}
			lastCharIsDelim = true;
			i++;
			continue;
		}

		lastCharIsDelim = false;

		if (char === '\\') {
			i += 2;
			continue;
		}

		if (char === '"') {
			const [value, startFrom] = parsePgArrayValue(arrayString, i + 1, true, delim);
			result.push(value);
			i = startFrom;
			continue;
		}

		if (char === '}') {
			return [result, i + 1];
		}

		if (char === '{') {
			const [value, startFrom] = parsePgNestedArray(arrayString, i + 1, delim);
			result.push(value);
			i = startFrom;
			continue;
		}

		const [value, newStartFrom] = parsePgArrayValue(arrayString, i, false, delim);
		result.push(value);
		i = newStartFrom;
	}

	return [result, i];
}

export function parsePgArray(arrayString: string, delim: string = DEFAULT_DELIM): any[] {
	const [result] = parsePgNestedArray(arrayString, 1, delim);
	return result;
}

function buildPgArray(array: any[], delim: string): string {
	return `{${
		array.map((item) => {
			if (Array.isArray(item)) {
				return buildPgArray(item, delim);
			}

			if (typeof item === 'string') {
				return `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
			}

			return `${item}`;
		}).join(delim)
	}}`;
}

export function makePgArray(array: any[], delim: string = DEFAULT_DELIM): string {
	return buildPgArray(array, delim);
}
