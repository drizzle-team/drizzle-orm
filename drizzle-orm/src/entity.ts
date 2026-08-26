export const entityKind = Symbol.for('drizzle:entityKind');
export const hasOwnEntityKind = Symbol.for('drizzle:hasOwnEntityKind');

export interface DrizzleEntity {
	[entityKind]: string;
}

export type DrizzleEntityClass<T> =
	& ((abstract new(...args: any[]) => T) | (new(...args: any[]) => T))
	& DrizzleEntity;

export function is<T extends DrizzleEntityClass<any>>(value: any, type: T): value is InstanceType<T> {
	if (value instanceof type) { // oxlint-disable-line drizzle-internal/no-instanceof
		return true;
	}

	if (value && typeof value === 'object') {
		// Traverse the prototype chain to find the entityKind
		for (
			let cls = Object.getPrototypeOf(value)?.constructor, targetKind = type[entityKind];
			cls;
			cls = Object.getPrototypeOf(cls)
		) {
			if (entityKind in cls && cls[entityKind] === targetKind) {
				return true;
			}
		}
	}
	return false;
}

// Faster checking for multiple entity kinds
export function isAnyKindIn(entityKinds: string[], value: any): boolean {
	if (value && typeof value === 'object') {
		// Traverse the prototype chain to find the entityKind
		for (let cls = Object.getPrototypeOf(value)?.constructor; cls; cls = Object.getPrototypeOf(cls)) {
			if (entityKind in cls && entityKinds.includes(cls[entityKind])) {
				return true;
			}
		}
	}

	return false;
}
