import { DrizzleError } from '~/errors.ts';

/** @internal */
export const TableName = Symbol.for('drizzle:Name');

function describeExtraConfigValue(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	if (typeof value !== 'object') return `a ${typeof value}`;

	const keys = Object.keys(value);
	return keys.length === 0
		? 'a plain object'
		: `a plain object with keys ${keys.map((key) => `"${key}"`).join(', ')}`;
}

/**
 * Thrown when a table's extra config callback returns something that isn't a builder,
 * which would otherwise be dropped silently and leave the declared index or constraint
 * missing from every generated migration.
 *
 * @internal
 */
export function throwUnknownExtraConfigValue(tableName: string, value: unknown): never {
	const hint = value !== null && typeof value === 'object' && !Array.isArray(value)
		? ' Builders must be returned as elements of the array, not wrapped in an object:'
			+ ' `(t) => [index("name").on(t.id)]`, not `(t) => [{ myIndex: index("name").on(t.id) }]`.'
		: '';

	throw new DrizzleError({
		message: `Invalid extra config value for table "${tableName}": expected an index or constraint builder,`
			+ ` but received ${describeExtraConfigValue(value)}.${hint}`,
	});
}
