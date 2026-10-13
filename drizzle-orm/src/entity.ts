export const entityKind = Symbol.for('drizzle:entityKind');
export const hasOwnEntityKind = Symbol.for('drizzle:hasOwnEntityKind');
export const chunkKind = Symbol.for('drizzle:chunkKind');

/**
 * Numeric discriminant constants for fast type dispatch in hot paths.
 * Used as instance `[chunkKind]` (Symbol-keyed) property on SQL chunk types to replace
 * sequential is() cascades with a single switch statement.
 * @internal
 */
export const ChunkKind = {
	StringChunk: 1,
	Name: 2,
	SQL: 3,
	Table: 4,
	Column: 5,
	View: 6,
	Param: 7,
	Placeholder: 8,
	SQLAliased: 9,
	Subquery: 10,
	/** @internal Pre-serialized INSERT VALUES rows — bypasses Param allocation entirely. */
	InsertValues: 11,
} as const;

export interface DrizzleEntity {
	[entityKind]: string;
}

export type DrizzleEntityClass<T> =
	& ((abstract new(...args: any[]) => T) | (new(...args: any[]) => T))
	& DrizzleEntity;

export function is<T extends DrizzleEntityClass<any>>(value: any, type: T): value is InstanceType<T> {
	if (!value || typeof value !== 'object') {
		return false;
	}

	if (value instanceof type) { // oxlint-disable-line drizzle-internal/no-instanceof
		return true;
	}

	if (!Object.prototype.hasOwnProperty.call(type, entityKind)) {
		throw new Error(
			`Class "${
				type.name ?? '<unknown>'
			}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`,
		);
	}

	let cls = Object.getPrototypeOf(value).constructor;
	if (cls) {
		// Traverse the prototype chain to find the entityKind
		while (cls) {
			if (entityKind in cls && cls[entityKind] === type[entityKind]) {
				return true;
			}

			cls = Object.getPrototypeOf(cls);
		}
	}

	return false;
}
