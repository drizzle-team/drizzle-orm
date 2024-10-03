import chalk from 'chalk';
import { SQL } from 'drizzle-orm';
import { getMaterializedViewConfig, PgEnum } from 'drizzle-orm/pg-core';

export function getCollisions<T extends any>(values: T[]): T[] {
	const acc = new Set<T>();
	const collisions = new Set<T>();

	for (const value of values) {
		if (acc.has(value)) {
			collisions.add(value);
		}
		acc.add(value);
	}

	return Array.from(collisions);
}

export function getCollisionsByKey<T extends Record<string, any>, K extends keyof T>(values: T[], key: K): T[K][] {
	const acc = new Set<T[K]>();
	const collisions = new Set<T[K]>();

	for (const value of values) {
		const valueKey = value[key];
		if (acc.has(valueKey)) {
			collisions.add(valueKey);
		}
		acc.add(valueKey);
	}

	return Array.from(collisions);
}

export function listStr<
	TCount extends number,
	TSingular extends string,
	TPlural extends string,
>(...list: [TCount, TSingular, TPlural][]) {
	let in_: string[] = [];

	for (const [count, singular, plural] of list) {
		if (count > 0) {
			in_.push(`${count} ${count === 1 ? singular : plural}`);
		}
	}

	if (in_.length === 0) {
		return '';
	}

	if (in_.length === 1) {
		return fmtValue(in_[0], false);
	}

	return fmtValue(`${[...in_.slice(0, -1)].join(', ')} and ${in_.slice(-1)}`, false);
}

export function entityName(schema: string | undefined, name: string, fmt?: boolean) {
	const str = `${schema ? `"${schema}".` : ''}"${name}"`;
	return fmt ? chalk.underline.bold(str) : str;
}

export function fmtValue(value: string, withQuotes: boolean) {
	return chalk.bold(withQuotes ? `"${value}"` : value);
}

export type Table = {
	name: string;
	schema?: string;
	columns: { name: string }[];
	indexes: {
		name: string;
		columns: ({
			name: string;
			type: string;
			op?: string;
		} | SQL)[];
	}[];
	foreignKeys: {
		name: string;
		reference: {
			columns: {
				name: string;
				sqlType: string;
				table: {
					name: string;
					schema?: string;
				};
			}[];
			foreignColumns: {
				name: string;
				sqlType: string;
				table: {
					name: string;
					schema?: string;
				};
			}[];
		};
	}[];
	checks: { name: string }[];
	primaryKeys: {
		name: string;
		columns: {
			name: string;
			table: {
				name: string;
				schema?: string;
			};
		}[];
	}[];
	uniqueConstraints: { name: string }[];
};
export type View = { name: string; schema?: string };
export type MaterializedView = ReturnType<typeof getMaterializedViewConfig>;
export type Schema = { schemaName: string };
export type Enum = PgEnum<any>;
export type Sequence = {
	seqName: string;
	seqOptions?: { increment?: number | string; minValue?: number | string; maxValue?: number | string };
};
