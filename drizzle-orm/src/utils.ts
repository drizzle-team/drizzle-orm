import { type AnyColumn, type Column } from './column.ts';
import { entityKind } from './entity.ts';
import type { JoinNullability, JoinType, SelectMode } from './query-builders/select.types.ts';
import type { SQL, SQLChunk, SQLWrapper } from './sql/sql.ts';
import type { Table } from './table.ts';
import type { Assume, ValueOrArray } from './utils.ts';

export const noop = (): void => {};

export const fillPlaceholders = (query: unknown[], params: Record<string, unknown>): unknown[] => {
	if (params && Object.keys(params).length > 0) {
		return query.map((p) => {
			if (isPlaceholder(p)) {
				if (p in params) {
					return params[p];
				}
				throw new Error(`Parameter "${p}" not found`);
			}
			return p;
		});
	}
	return query;
};

export const is = {
	object(obj: unknown): obj is Record<string, unknown> {
		return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
	},
	string(val: unknown): val is string {
		return typeof val === 'string';
	},
	number(val: unknown): val is number {
		return typeof val === 'number';
	},
	undefined(val: unknown): val is undefined {
		return val === undefined;
	},
	null(val: unknown): val is null {
		return val === null;
	},
	iterable(val: unknown): val is Iterable<unknown> {
		return is.object(val) && typeof val[Symbol.iterator] === 'function';
	},
	column(val: unknown): val is AnyColumn {
		return is.object(val) && 'name' in val && 'table' in val;
	},
	sql(val: unknown): val is SQL {
		return is.object(val) && '_' in val && '_sql' in val;
	},
	sqlWrapper(val: unknown): val is SQLWrapper {
		return is.sql(val) || is.object(val) && 'getSQL' in val;
	},
	placeholder(val: unknown): val is Placeholder {
		return is.object(val) && 'placeholder' in val && typeof val.placeholder === 'string';
	},
	array(val: unknown): val is unknown[] {
		return Array.isArray(val);
	},
};

export function mapResultRow<TResult>(
	fields: SelectedFieldsOrdered,
	row: unknown[],
	joinsNotNullableMap: Record<string, boolean> | undefined,
): TResult {
	const result: Record<string, unknown> = {};
	const joinedResults: Record<string, Record<string, unknown>> = {};
	const map = new Map<string, { fieldIndex: number; fieldName: string }>();

	// Build a map of column names to their positions in the row array
	for (let i = 0; i < fields.length; i++) {
		const field = fields[i]!;
		if (field.path.length > 0) {
			const path = field.path.join('.');
			map.set(path, { fieldIndex: i, fieldName: field.name });
		} else {
			map.set(field.name, { fieldIndex: i, fieldName: field.name });
		}
	}

	for (const [path, { fieldIndex, fieldName }] of map) {
		const rawValue = row[fieldIndex];
		const isNested = path.includes('.');

		if (isNested) {
			const [tableName, ...nestedPath] = path.split('.');
			if (!joinedResults[tableName]) {
				joinedResults[tableName] = {};
			}
			let current = joinedResults[tableName]!;

			for (let i = 0; i < nestedPath.length - 1; i++) {
				const part = nestedPath[i]!;
				if (!current[part]) {
					current[part] = {};
				}
				current = current[part] as Record<string, unknown>;
			}

			const lastPart = nestedPath[nestedPath.length - 1]!;
			current[lastPart] = rawValue;
		} else {
			result[fieldName] = rawValue;
		}
	}

	// Merge joined results into the main result
	for (const [tableName, nestedResult] of Object.entries(joinedResults)) {
		if (joinsNotNullableMap?.[tableName] === false && Object.values(nestedResult).every((v) => v === null)) {
			continue;
		}
		result[tableName] = nestedResult;
	}

	return result as TResult;
}

export type SelectedFieldsOrdered = {
	name: string;
	path: string[];
	field: AnyColumn | SQLWrapper;
}[];