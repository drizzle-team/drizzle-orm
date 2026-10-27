const nativeHasInstance = Function.prototype[Symbol.hasInstance];

// A project can load two copies of Drizzle Postgres, for example a standalone package and the copy bundled in
// drizzle-orm. The brand is a registered symbol without a version, so `instanceof` also matches
// instances from the other copy. The class name comes as a string because minifiers rename classes,
// so `target.name` can differ between two copies.
const brandKey = (name: string) => Symbol.for(`@drizzle-team/postgres:${name}`);

export function addBrand(target: abstract new(...args: any[]) => unknown, name: string): void {
	const key = brandKey(name);
	Object.defineProperty(target.prototype, key, { value: true });
	Object.defineProperty(target, Symbol.hasInstance, {
		value(this: unknown, value: unknown): boolean {
			if (nativeHasInstance.call(this, value)) return true;
			// A user subclass inherits this method and keeps only the native check for its own class.
			return this === target && value != null && (value as Record<symbol, unknown>)[key] === true;
		},
	});
}

// Checks a brand without the class, so that the caller does not have to load the module of the class.
export function isBrand<T>(value: unknown, name: string): value is T {
	return value != null && (value as Record<symbol, unknown>)[brandKey(name)] === true;
}
