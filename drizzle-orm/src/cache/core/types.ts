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
};
