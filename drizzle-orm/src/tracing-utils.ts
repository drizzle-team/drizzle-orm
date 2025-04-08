export function iife<T extends unknown[], U>(fn: (...args: T) => U, ...args: T): U {
	return fn(...args);
}
