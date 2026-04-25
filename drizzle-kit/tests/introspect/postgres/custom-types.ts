/**
 * Stub custom type definitions used by the columnTypeMapper test fixtures.
 * These use plain Date / string so no third-party date library is required.
 */
import { customType } from 'drizzle-orm/pg-core';

export const dayjsTimestamp = customType<{ data: Date; driverData: string }>({
	dataType() {
		return 'timestamp';
	},
	fromDriver: (v: string) => new Date(v),
	toDriver: (v: Date) => v.toISOString(),
});

export const luxonTimestamp = customType<{ data: Date; driverData: string }>({
	dataType() {
		return 'timestamp with time zone';
	},
	fromDriver: (v: string) => new Date(v),
	toDriver: (v: Date) => v.toISOString(),
});
