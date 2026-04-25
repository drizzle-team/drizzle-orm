/**
 * Example custom column type definitions for use with `columnTypeMapper`.
 *
 * Run `drizzle-kit pull` with one of the drizzle.config.*.ts files in this
 * directory to see how the generated schema.ts changes based on the mapper.
 *
 * This file is written once by you and never overwritten by `drizzle-kit pull`.
 */

import { customType } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// dayjs example
// Requires: npm install dayjs
// ---------------------------------------------------------------------------

import dayjs from 'dayjs';

export const dayjsTimestamp = customType<{
	data: dayjs.Dayjs;
	driverData: string;
}>({
	dataType() {
		return 'timestamp';
	},
	fromDriver(value: string): dayjs.Dayjs {
		return dayjs(value);
	},
	toDriver(value: dayjs.Dayjs): string {
		return value.toISOString();
	},
});

// ---------------------------------------------------------------------------
// luxon example
// Requires: npm install luxon @types/luxon
// ---------------------------------------------------------------------------

import { DateTime } from 'luxon';

export const luxonTimestamp = customType<{
	data: DateTime;
	driverData: string;
}>({
	dataType() {
		return 'timestamp with time zone';
	},
	fromDriver(value: string): DateTime {
		return DateTime.fromISO(value);
	},
	toDriver(value: DateTime): string {
		return value.toISO()!;
	},
});

// ---------------------------------------------------------------------------
// Temporal (TC39 proposal) example
// Requires: npm install @js-temporal/polyfill
// ---------------------------------------------------------------------------

import { Temporal } from '@js-temporal/polyfill';

export const temporalInstant = customType<{
	data: Temporal.Instant;
	driverData: string;
}>({
	dataType() {
		return 'timestamp with time zone';
	},
	fromDriver(value: string): Temporal.Instant {
		return Temporal.Instant.from(value);
	},
	toDriver(value: Temporal.Instant): string {
		return value.toString();
	},
});
