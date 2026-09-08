import chalk from 'chalk';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import type { SQL } from 'orm044';
import { CasingCache, toCamelCase, toSnakeCase } from 'orm044/casing';
import { join } from 'path';
import { parse } from 'url';
import type { CasingType } from './common';
import { assertUnreachable, snapshotVersion } from './global';
import type { Dialect } from './schemaValidator';

export type DB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
};

export type SQLiteDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
};

export type LibSQLDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
	batchWithPragma?(queries: string[]): Promise<void>;
};

export const copy = <T>(it: T): T => {
	return JSON.parse(JSON.stringify(it));
};

export const objectValues = <T extends object>(obj: T): Array<T[keyof T]> => {
	return Object.values(obj);
};

export const assertV1OutFolder = (out: string) => {
	if (!existsSync(out)) return;

	const oldMigrationFolders = readdirSync(out).filter(
		(it) => it.length === 14 && /^\d+$/.test(it),
	);

	if (oldMigrationFolders.length > 0) {
		console.log(
			`Your migrations folder format is outdated, please run ${
				chalk.green.bold(
					`drizzle-kit up`,
				)
			}`,
		);
		process.exit(1);
	}
};

export type Journal = {
	version: string;
	dialect: Dialect;
	entries: {
		idx: number;
		version: string;
		when: number;
		tag: string;
		breakpoints: boolean;
	}[];
};

export const dryJournal = (dialect: Dialect): Journal => {
	return {
		version: snapshotVersion,
		dialect,
		entries: [],
	};
};

// export const preparePushFolder = (dialect: Dialect) => {
//   const out = ".drizzle";
//   let snapshot: string = "";
//   if (!existsSync(join(out))) {
//     mkdirSync(out);
//     snapshot = JSON.stringify(dryJournal(dialect));
//   } else {
//     snapshot = readdirSync(out)[0];
//   }

//   return { snapshot };
// };

export const prepareOutFolder = (out: string, dialect: Dialect) => {
	const meta = join(out, 'meta');
	const journalPath = join(meta, '_journal.json');

	if (!existsSync(join(out, 'meta'))) {
		mkdirSync(meta, { recursive: true });
		writeFileSync(journalPath, JSON.stringify(dryJournal(dialect)));
	}

	const journal = JSON.parse(readFileSync(journalPath).toString());

	const snapshots = readdirSync(meta)
		.filter((it) => !it.startsWith('_'))
		.map((it) => join(meta, it));

	snapshots.sort();
	return { meta, snapshots, journal };
};

export const columnRenameKey = (
	table: string,
	schema: string,
	column: string,
) => {
	const out = schema
		? `"${schema}"."${table}"."${column}"`
		: `"${table}"."${column}"`;
	return out;
};

export const kloudMeta = () => {
	return {
		pg: [5],
		mysql: [] as number[],
		sqlite: [] as number[],
	};
};

export const normaliseSQLiteUrl = (
	it: string,
	type: 'libsql' | 'better-sqlite',
) => {
	if (type === 'libsql') {
		if (it.startsWith('file:')) {
			return it;
		}
		try {
			const url = parse(it);
			if (url.protocol === null) {
				return `file:${it}`;
			}
			return it;
		} catch {
			return `file:${it}`;
		}
	}

	if (type === 'better-sqlite') {
		if (it.startsWith('file:')) {
			return it.substring(5);
		}

		return it;
	}

	assertUnreachable(type);
};

export const normalisePGliteUrl = (
	it: string,
) => {
	if (it.startsWith('file:')) {
		return it.substring(5);
	}

	return it;
};

export function isPgArrayType(sqlType: string) {
	return sqlType.match(/.*\[\d*\].*|.*\[\].*/g) !== null;
}

export function findAddedAndRemoved(columnNames1: string[], columnNames2: string[]) {
	const set1 = new Set(columnNames1);
	const set2 = new Set(columnNames2);

	const addedColumns = columnNames2.filter((it) => !set1.has(it));
	const removedColumns = columnNames1.filter((it) => !set2.has(it));

	return { addedColumns, removedColumns };
}

export function escapeSingleQuotes(str: string) {
	return str.replace(/'/g, "''");
}

export function unescapeSingleQuotes(str: string, ignoreFirstAndLastChar: boolean) {
	const regex = ignoreFirstAndLastChar ? /(?<!^)'(?!$)/g : /'/g;
	return str.replace(/''/g, "'").replace(regex, "\\'");
}

export function getColumnCasing(
	column: { keyAsName: boolean; name: string | undefined },
	casing: CasingType | undefined,
) {
	if (!column.name) return '';
	return !column.keyAsName || casing === undefined
		? column.name
		: casing === 'camelCase'
		? toCamelCase(column.name)
		: toSnakeCase(column.name);
}

export const sqlToStr = (sql: SQL, casing: CasingType | undefined) => {
	return sql.toQuery({
		escapeName: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeParam: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeString: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		casing: new CasingCache(casing),
	}).sql;
};
