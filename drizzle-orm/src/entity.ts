export const entityKind = Symbol.for('drizzle:entityKind');
export const hasOwnEntityKind = Symbol.for('drizzle:hasOwnEntityKind');

export interface DrizzleEntity {
	[entityKind]: string;
}

export type DrizzleEntityClass<T> =
	& ((abstract new(...args: any[]) => T) | (new(...args: any[]) => T))
	& DrizzleEntity;

const kindsByConstructor = new WeakMap<object, Set<string>>();
function collectKinds(ctor: object): Set<string> {
	const kinds = new Set<string>();
	for (let cls: any = ctor; cls; cls = Object.getPrototypeOf(cls)) {
		if (entityKind in cls) kinds.add(cls[entityKind]);
	}
	kindsByConstructor.set(ctor, kinds);
	return kinds;
}

const nativeHasInstance = Function.prototype[Symbol.hasInstance];
export function is<T extends DrizzleEntityClass<any>>(value: any, type: T): value is InstanceType<T> {
	// `instanceof` would loop back to `is` due to `Symbol.hasInstance` redefinitions
	if (nativeHasInstance.call(type, value)) return true;
	if (value === null || typeof value !== 'object') return false;

	const ctor = Object.getPrototypeOf(value)?.constructor;
	if (typeof ctor !== 'function') return false;

	return (kindsByConstructor.get(ctor) ?? collectKinds(ctor)).has(type[entityKind]);
}

export function entityKindsOf(value: unknown): Set<string> | undefined {
	if (value === null || typeof value !== 'object') return undefined;

	const ctor = Object.getPrototypeOf(value)?.constructor;
	if (typeof ctor !== 'function') return undefined;

	return kindsByConstructor.get(ctor) ?? collectKinds(ctor);
}
