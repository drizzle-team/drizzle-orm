import { escapeSingleQuotes } from 'src/utils';
import { assertUnreachable } from '../../utils';
import { hash } from '../common';
import { DefaultConstraint, MssqlEntities } from './ddl';

export const defaultNameForPK = (table: string) => {
	const desired = `${table}_pkey`;
	const res = desired.length > 128
		? `${hash(desired)}_pkey` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForUnique = (table: string, column: string[]) => {
	const desired = `${table}_${column}_key`;
	const res = desired.length > 128
		? table.length < 128 - 18 // _{hash(12)}_key
			? `${table}_${hash(desired)}_key`
			: `${hash(desired)}_key` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForFK = (table: string, columns: string[], tableTo: string, columnsTo: string[]) => {
	const desired = `${table}_${columns.join('_')}_${tableTo}_${columnsTo.join('_')}_fk`;
	const res = desired.length > 128
		? table.length < 128 - 18 // _{hash(12)}_fkey
			? `${table}_${hash(desired)}_fk`
			: `${hash(desired)}_fk` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export const defaultNameForDefault = (table: string, column: string) => {
	const desired = `${table}_${column}_default`;
	const res = desired.length > 128
		? table.length < 128 - 18 // _{hash(12)}_default
			? `${table}_${hash(desired)}__default`
			: `${hash(desired)}__default` // 1/~3e21 collision chance within single schema, it's fine
		: desired;
	return res;
};

export type OnAction = MssqlEntities['fks']['onUpdate'];
export const parseFkAction = (type: string): OnAction => {
	switch (type) {
		case 'NO_ACTION':
			return 'NO ACTION';
		case 'SET_NULL':
			return 'SET NULL';
		case 'CASCADE':
			return 'CASCADE';
		case 'SET_DEFAULT':
			return 'SET DEFAULT';
		default:
			throw new Error(`Unknown foreign key type: ${type}`);
	}
};

const viewAsStatementRegex = /\bAS\b\s*\(?(SELECT[\s\S]*)\)?;?$/i;
export const parseViewSQL = (sql: string | null): string | null => {
	if (!sql) return ''; // this means that used is_encrypted

	const match = sql.match(viewAsStatementRegex);
	return match ? match[1] : null;
};

const viewMetadataRegex = /(\bwith\s+view_metadata\b)/i;
export const parseViewMetadataFlag = (sql: string | null): boolean => {
	if (!sql) return false;

	const match = sql.match(viewMetadataRegex);
	return match ? true : false;
};

export const defaultForColumn = (
	def: string | null | undefined,
): DefaultConstraint['default'] => {
	if (
		def === null
		|| def === undefined
	) {
		return null;
	}

	const value = def;
	// 'text', potentially with escaped double quotes ''
	if (/^'(?:[^']|'')*'$/.test(value)) {
		const res = value.substring(1, value.length - 1).replaceAll("''", "'");

		return { value: res, type: 'string' };
	}

	if (/^true$|^false$/.test(value)) {
		return { value: value, type: 'boolean' };
	}

	// previous /^-?[\d.]+(?:e-?\d+)?$/
	if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
		const num = Number(value);
		const big = num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER;
		return { value: value, type: big ? 'bigint' : 'number' };
	}

	return { value: value, type: 'unknown' };
};

export const defaultToSQL = (it: DefaultConstraint['default']) => {
	if (!it) return '';

	const { value, type } = it;
	if (type === 'string' || type === 'text') {
		return `'${escapeSingleQuotes(value)}'`;
	}
	if (type === 'bigint') {
		return `'${value}'`;
	}

	if (type === 'boolean') {
		return String(value === 'true' ? 1 : 0);
	}

	if (type === 'number' || type === 'unknown') {
		return value;
	}
	if (type === 'buffer') {
		return '0x' + Buffer.from(value).toString('hex');
	}

	assertUnreachable(type);
};
