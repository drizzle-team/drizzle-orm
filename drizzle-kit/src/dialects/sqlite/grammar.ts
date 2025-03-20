const namedCheckPattern = /CONSTRAINT\s*["']?(\w+)["']?\s*CHECK\s*\((.*?)\)/gi;
const unnamedCheckPattern = /CHECK\s*\((.*?)\)/gi;
const viewAsStatementRegex = new RegExp(`\\bAS\\b\\s+(SELECT.+)$`, 'i');

const intAffinities = [
	'INT',
	'INTEGER',
	'TINYINT',
	'SMALLINT',
	'MEDIUMINT',
	'BIGINT',
	'UNSIGNED BIG INT',
	'INT2',
	'INT8',
];

export const parseTableSQL = (sql: string) => {
	const namedChecks = [...sql.matchAll(namedCheckPattern)].map((it) => {
		const [_, name, value] = it;
		return { name, value: value.trim() };
	});
	const unnamedChecks = [...sql.matchAll(unnamedCheckPattern)].map((it) => {
		const [_, value] = it;

		return { name: null, value: value.trim() };
	});

	return {
		checks: [...namedChecks, ...unnamedChecks],
	};
};

export const parseViewSQL = (sql: string) => {
	const match = sql.match(viewAsStatementRegex);
	return match ? match[1] : null;
};

export interface Generated {
	as: string;
	type: 'stored' | 'virtual';
}

export function extractGeneratedColumns(input: string): Record<string, Generated> {
	const columns: Record<string, Generated> = {};
	const lines = input.split(/,\s*(?![^()]*\))/); // Split by commas outside parentheses

	for (const line of lines) {
		if (line.includes('GENERATED ALWAYS AS')) {
			const parts = line.trim().split(/\s+/);
			const columnName = parts[0].replace(/[`'"]/g, ''); // Remove quotes around the column name
			const expression = line
				.substring(line.indexOf('('), line.indexOf(')') + 1)
				.trim();

			// Extract type ensuring to remove any trailing characters like ')'
			const typeIndex = parts.findIndex((part) => part.match(/(stored|virtual)/i));
			let type: Generated['type'] = 'virtual';
			if (typeIndex !== -1) {
				type = parts[typeIndex]
					.replace(/[^a-z]/gi, '')
					.toLowerCase() as Generated['type'];
			}

			columns[columnName] = {
				as: expression,
				type,
			};
		}
	}
	return columns;
}
