import type { CasingCache } from '~/casing.ts';
import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';

type DialectWithCasing = { casing: CasingCache };

export function getFieldKey(field: unknown, dialect: DialectWithCasing): string | undefined {
	if (is(field, SQL.Aliased)) {
		return field.fieldAlias;
	}
	if (is(field, Column)) {
		return dialect.casing.getColumnCasing(field);
	}
	return undefined;
}

export function mapDb0RowToArray(
	row: Record<string, unknown>,
	fields: ReadonlyArray<{ field: unknown }>,
	dialect: DialectWithCasing,
): unknown[] {
	const keys = fields.map((f) => getFieldKey(f.field, dialect));

	// If we can't confidently map by key (unknown field type, duplicate keys, missing key),
	// fall back to Object.values and accept db0 limitations for complex selections.
	if (keys.some((k) => k === undefined)) {
		return Object.values(row);
	}

	const unique = new Set(keys as string[]);
	if (unique.size !== keys.length) {
		return Object.values(row);
	}

	for (const key of keys as string[]) {
		if (!(key in row)) {
			return Object.values(row);
		}
	}

	return (keys as string[]).map((key) => row[key]);
}
