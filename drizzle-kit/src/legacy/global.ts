export const originUUID = '00000000-0000-0000-0000-000000000000';
export const snapshotVersion = '7';

export function assertUnreachable(x: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

// don't fail in runtime, types only
export function softAssertUnreachable(x: never) {
	return null as never;
}

export const mapValues = <IN, OUT>(
	obj: Record<string, IN>,
	map: (input: IN) => OUT,
): Record<string, OUT> => {
	const result = Object.keys(obj).reduce(function(result, key) {
		result[key] = map(obj[key]);
		return result;
	}, {} as Record<string, OUT>);
	return result;
};

export const mapKeys = <T>(
	obj: Record<string, T>,
	map: (key: string, value: T) => string,
): Record<string, T> => {
	const result = Object.fromEntries(
		Object.entries(obj).map(([key, val]) => {
			const newKey = map(key, val);
			return [newKey, val];
		}),
	);
	return result;
};

export const mapEntries = <T>(
	obj: Record<string, T>,
	map: (key: string, value: T) => [string, T],
): Record<string, T> => {
	const result = Object.fromEntries(
		Object.entries(obj).map(([key, val]) => {
			const [newKey, newVal] = map(key, val);
			return [newKey, newVal];
		}),
	);
	return result;
};

export const customMapEntries = <TReturn, T = any>(
	obj: Record<string, T>,
	map: (key: string, value: T) => [string, TReturn],
): Record<string, TReturn> => {
	const result = Object.fromEntries(
		Object.entries(obj).map(([key, val]) => {
			const [newKey, newVal] = map(key, val);
			return [newKey, newVal];
		}),
	);
	return result;
};
