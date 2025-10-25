export const error = `error`;
export const ignore = `ignore`;
export const preserve = `preserve`;
export const CONSTRUCTOR_ACTIONS = [error, ignore, preserve] as const;
export const PROTO_ACTIONS = CONSTRUCTOR_ACTIONS;
export type JsonBigIntOptions = {
	/**
	 * @default false
	 */
	errorOnBigIntDecimalOrScientific?: boolean;
	/**
	 * @default false
	 */
	errorOnDuplicatedKeys?: boolean;
	/**
	 * @default false
	 */
	strict?: boolean;
	/**
	 * @default false
	 */
	parseBigIntAsString?: boolean;
	/**
	 * @default false
	 */
	alwaysParseAsBigInt?: boolean;
	/**
	 * @default 'preserve'
	 */
	protoAction?: (typeof PROTO_ACTIONS)[number];
	/**
	 * @default 'preserve'
	 */
	constructorAction?: (typeof CONSTRUCTOR_ACTIONS)[number];
};

export const isNonNullObject = (
	o: unknown,
): o is Record<string, unknown> | unknown[] => {
	return o !== null && typeof o === `object`;
};

export class Cache<K extends string | number | symbol, V> {
	private _cache = {} as Record<K, V>;
	private _size = 0;
	private _old = {} as Record<K, V>;

	constructor(private readonly _max = 1e6 / 2) {}

	get(key: K): V | undefined {
		return this.has(key) ? this._cache[key] : undefined;
	}

	set(key: K, value: V): V {
		if (this._size >= this._max) {
			this._old = this._cache;
			this._cache = {} as Record<K, V>;
			this._size = 0;
		}
		this._cache[key] = value;
		this._size++;
		return value;
	}

	has(key: K): boolean {
		if (Object.prototype.hasOwnProperty.call(this._cache, key)) return true;
		if (Object.prototype.hasOwnProperty.call(this._old, key)) {
			this._cache[key] = this._old[key];
			return true;
		}
		return false;
	}
}
