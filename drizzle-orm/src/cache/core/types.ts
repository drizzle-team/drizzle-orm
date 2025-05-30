export type CacheConfig = {
	/**
	 * expire time, in seconds (a positive integer)
	 */
	ex?: number;
	/**
	 * expire time, in milliseconds (a positive integer).
	 */
	px?: number;
	/**
	 * Unix time at which the key will expire, in seconds (a positive integer).
	 */
	exat?: number;
	/**
	 * Unix time at which the key will expire, in milliseconds (a positive integer)
	 */
	pxat?: number;
	/**
	 * Retain the time to live associated with the key.
	 */
	keepTtl?: boolean;
	/**
	 * Set an expiration (TTL or time to live) on one or more fields of a given hash key.
	 * Used for HEXPIRE command
	 */
	hexOptions?: 'NX' | 'nx' | 'XX' | 'xx' | 'GT' | 'gt' | 'LT' | 'lt';
};

export type WithCacheConfig = { enable: boolean; config?: CacheConfig; tag?: string; autoInvalidate?: boolean };
