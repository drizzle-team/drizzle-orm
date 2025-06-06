import { ForeignKey } from './ddl';

const namedCheckPattern = /CONSTRAINT\s*["']?(\w+)["']?\s*CHECK\s*\((.*?)\)/gi;
const unnamedCheckPattern = /CHECK\s*\((.*?)\)/gi;
const viewAsStatementRegex = new RegExp(`\\bAS\\b\\s+(SELECT.+)$`, 'i');

export const nameForForeignKey = (fk: Pick<ForeignKey, 'table' | 'columns' | 'tableTo' | 'columnsTo'>) => {
	return `fk_${fk.table}_${fk.columns.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`;
};
export const nameForUnique = (table: string, columns: string[]) => {
	return `${table}_${columns.join('_')}_unique`;
};

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

export function sqlTypeFrom(sqlType: string): string {
	const lowered = sqlType.toLowerCase();
	if (
		[
			'int',
			// 'integer', redundant
			// 'integer auto_increment', redundant
			'tinyint',
			'smallint',
			'mediumint',
			'bigint',
			'unsigned big int',
			// 'int2', redundant
			// 'int8', redundant
		].some((it) => lowered.startsWith(it))
	) {
		return 'integer';
	}

	if (
		[
			'character',
			'varchar',
			'varying character',
			'national varying character',
			'nchar',
			'native character',
			'nvarchar',
			'text',
			'clob',
		].some((it) => lowered.startsWith(it))
	) {
		const match = lowered.match(/\d+/);

		if (match) {
			return `text(${match[0]})`;
		}

		return 'text';
	}

	if (lowered.startsWith('blob')) {
		return 'blob';
	}

	if (
		['real', 'double', 'double precision', 'float'].some((it) => lowered.startsWith(it))
	) {
		return 'real';
	}

	return 'numeric';
}

export const parseTableSQL = (sql: string) => {
	const namedChecks = [...sql.matchAll(namedCheckPattern)].map((it) => {
		const [_, name, value] = it;
		return { name, value: value.trim() };
	});
	const unnamedChecks = [...sql.matchAll(unnamedCheckPattern)].map((it) => {
		const [_, value] = it;
		return { name: null, value: value.trim() };
	}).filter((it) => !namedChecks.some((x) => x.value === it.value));

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

export const omitSystemTables = () => {
	['__drizzle_migrations', `'\\_cf\\_%'`, `'\\_litestream\\_%'`, `'libsql\\_%'`, `'sqlite\\_%'`];
	return true;
};
