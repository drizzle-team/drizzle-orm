/* eslint-disable no-instanceof/no-instanceof */
export function capitalize(str: string) {
	return str.length ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

export function uncapitalize(str: string) {
	return str.length ? str.charAt(0).toLowerCase() + str.slice(1) : str;
}

export type TSCDiagOutput = {
	files: number;
	lines: number;
	identifiers: number;
	symbols: number;
	types: number;
	instantiations: number;
	/** Memory in kilobytes */
	memoryUsed: number;
	ioRead: number;
	ioWrite: number;
	parseTime: number;
	bindTime: number;
	checkTime: number;
	emitTime: number;
	totalTime: number;
};

export function parseDiagOutput(output: Buffer | string) {
	const outStr = output instanceof Buffer ? output.toString() : output as string;

	const lines = outStr.split('\n').filter(Boolean);

	const spacers = /:[\t ]*/;
	const notLetter = /[^A-Za-z]/;

	return Object.fromEntries(lines.map((l) => {
		const [k, v] = l.split(spacers) as [string, string];

		// Form key
		const kParts = k.split(notLetter);
		const kStart = kParts.shift()!;
		const camelCaseKey = `${uncapitalize(kStart)}${
			kParts.map((p) => p.length > 1 ? capitalize(p) : p.toLowerCase()).join('')
		}`;

		// Form value
		const sanitized = v.endsWith('s') || v.endsWith('K')
			? v.slice(0, -1)
			: v;
		const numberValue = Number(sanitized);

		return [camelCaseKey, numberValue];
	})) as TSCDiagOutput;
}
