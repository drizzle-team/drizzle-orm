import postgres from 'postgres';
import { describe, expect, test } from 'vitest';
import { drizzle } from '~/postgres-js/driver.ts';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/5789
//
// drizzle(client) neutralizes postgres-js's inbound *parsers* for date/timestamp
// OIDs so Drizzle can parse the raw text itself. It must NOT also neutralize the
// outbound *serializers* for those same OIDs — doing so causes postgres-js's
// Bind() step to receive a raw `Date` instance instead of a wire-safe string,
// which throws when postgres-js calls `Buffer.byteLength(date)`.
const DATE_OIDS = ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231'] as const;

function createUnconnectedClient() {
	// postgres-js is lazy: constructing a client does not open a socket, so this
	// is safe to run without a live Postgres instance.
	return postgres({ host: 'localhost', port: 5432, database: 'x', username: 'x', password: 'x' });
}

describe('postgres-js driver: date OID parser/serializer split', () => {
	test('drizzle(client) leaves the outbound Date serializer intact (only neutralizes the inbound parser)', () => {
		// Capture postgres-js's own default serializer before drizzle touches anything.
		const reference = createUnconnectedClient();
		const defaultSerializer = reference.options.serializers['1184'];
		expect(typeof defaultSerializer).toBe('function');

		const client = createUnconnectedClient();
		drizzle(client);

		const date = new Date('2026-05-20T12:00:00.000Z');

		// The serializer must still behave like postgres-js's untouched default:
		// it must convert the Date to a wire-safe string, not pass it through unchanged.
		const serializer = client.options.serializers['1184']!;
		const serialized: unknown = serializer(date);
		expect(serialized).toBe(defaultSerializer!(date));
		expect(serialized).not.toBeInstanceOf(Date);
		expect(typeof serialized).toBe('string');

		// A value produced by the outbound serializer must be safely encodable on
		// the wire. This is exactly what postgres-js's Bind() step does internally
		// (bytes.js `str()` -> `Buffer.byteLength()`), and is what throws
		// `TypeError [ERR_INVALID_ARG_TYPE]` when the serializer is a passthrough.
		expect(() => Buffer.byteLength(serialized as string)).not.toThrow();
	});

	test('drizzle(client) still neutralizes the inbound parser for date/timestamp OIDs', () => {
		const client = createUnconnectedClient();
		drizzle(client);

		// This is the behavior the override was actually meant to provide: Drizzle
		// wants the raw text back from Postgres so it can parse dates itself.
		for (const oid of DATE_OIDS) {
			const rawText = '2026-05-20 12:00:00+00';
			const parser = client.options.parsers[oid]!;
			expect(parser(rawText)).toBe(rawText);
		}
	});
});
