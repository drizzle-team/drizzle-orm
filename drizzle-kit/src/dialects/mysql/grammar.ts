import { assertUnreachable } from '../../utils';
import { trimChar } from '../postgres/grammar';
import { Column, ForeignKey } from './ddl';

export const nameForForeignKey = (fk: Pick<ForeignKey, 'table' | 'columns' | 'tableTo' | 'columnsTo'>) => {
	return `fk_${fk.table}_${fk.columns.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`;
};

export const nameForIndex = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

const stripCollation = (defaultValue: string, collation?: string): string => {
	const coll = collation ?? 'utf8mb4';
	const escaped = coll.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
	const regex = new RegExp(`_${escaped}(?=(?:\\\\['"]|['"]))`, 'g');
	const res = defaultValue.replace(regex, '').replaceAll("\\'", "'").replaceAll("\\\\'", "''");
	return res;
};

function trimCollation(defaultValue: string, collate: string = 'utf8mb4') {
	const collation = `_${collate}`;
	if (defaultValue.startsWith(collation)) {
		return defaultValue
			.substring(collation.length, defaultValue.length)
			.replace(/\\/g, '');
	}
	return defaultValue;
}

export const parseDefaultValue = (
	columnType: string,
	value: string | undefined,
	collation: string | undefined,
): Column['default'] => {
	if (!value) return null;

	value = stripCollation(value, collation);

	if (columnType.startsWith('binary') || columnType.startsWith('varbinary') || columnType === 'text') {
		if (/^'(?:[^']|'')*'$/.test(value)) {
			return { value: trimChar(value, "'").replaceAll("''", "'"), type: 'text' };
		}

		const wrapped = value.startsWith('(') && value.endsWith(')') ? value : `(${value})`;
		return { value: wrapped, type: 'unknown' };
	}

	if (columnType.startsWith('enum') || columnType.startsWith('varchar') || columnType.startsWith('char')) {
		return { value, type: 'string' };
	}

	if (columnType === 'json') {
		return { value: trimChar(value, "'").replaceAll("''", "'"), type: 'json' };
	}

	if (
		columnType === 'date' || columnType.startsWith('datetime') || columnType.startsWith('timestamp')
		|| columnType.startsWith('time')
	) {
		return { value: value, type: 'string' };
	}

	if (columnType === 'tinyint(1)') {
		return { type: 'boolean', value: value === '1' ? 'true' : 'false' };
	}

	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
		const num = Number(value);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: value, type: big ? 'bigint' : 'number' };
	}

	console.error(`unknown default: ${columnType} ${value}`);
	return null;
};

const commutativeTypes = [
	['tinyint(1)', 'boolean'],
	['binary(1)', 'binary'],
	['now()', '(now())', 'CURRENT_TIMESTAMP', '(CURRENT_TIMESTAMP)', 'CURRENT_TIMESTAMP()'],
];

export const typesCommutative = (left: string, right: string) => {
	for (const it of commutativeTypes) {
		const leftIn = it.some((x) => x === left);
		const rightIn = it.some((x) => x === right);

		if (leftIn && rightIn) return true;
	}
	return false;
};

export const defaultToSQL = (it: Column['default']) => {
	if (!it) return null;

	if (it.type === 'bigint') {
		return `'${it.value}'`;
	}
	if (it.type === 'boolean' || it.type === 'number' || it.type === 'unknown') {
		return it.value;
	}

	if (it.type === 'string') {
		return `'${it.value.replaceAll("'", "''")}'`;
	}

	if (it.type === 'text' || it.type === 'json') {
		return `('${it.value.replaceAll("'", "''")}')`;
	}

	assertUnreachable(it.type);
};
