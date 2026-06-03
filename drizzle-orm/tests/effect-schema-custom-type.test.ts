import { Schema as s } from 'effect';
import { describe, expect, test } from 'vitest';
import { createSelectSchema } from '~/effect-schema/index.ts';
import { customType, integer, pgTable } from '~/pg-core/index.ts';

class FakeInstant {
	constructor(readonly iso: string) {}
	toString() {
		return this.iso;
	}
}
const InstantSchema = s.declare<FakeInstant>((v: unknown): v is FakeInstant => v instanceof FakeInstant);

describe('effect-schema customType.schemas.effect', () => {
	test('honors per-customType effect schema at runtime', () => {
		const instantType = customType<{
			data: FakeInstant;
			driverData: string;
			schemas: { effect: typeof InstantSchema };
		}>({
			codec: undefined,
			dataType: () => 'timestamptz',
			toDriver: (v) => v.toString(),
			fromDriver: (str) => new FakeInstant(str),
			schemas: { effect: InstantSchema },
		});

		const audit = pgTable('audit', {
			id: integer().notNull(),
			createdAt: instantType('created_at').notNull(),
		});

		const Row = createSelectSchema(audit);

		const now = new FakeInstant('2026-01-01T00:00:00Z');
		const decoded = s.decodeUnknownSync(Row)({ id: 1, createdAt: now });
		expect(decoded.createdAt).toBeInstanceOf(FakeInstant);
		expect(decoded.createdAt.iso).toBe('2026-01-01T00:00:00Z');

		// raw string should be rejected — the schema is no longer Schema.Any
		expect(() => s.decodeUnknownSync(Row)({ id: 1, createdAt: '2026-01-01T00:00:00Z' })).toThrow();
	});

	test('falls back to Schema.Any when schemas.effect is not provided', () => {
		const opaqueType = customType<{ data: { foo: string }; driverData: string }>({
			codec: undefined,
			dataType: () => 'text',
			toDriver: (v) => JSON.stringify(v),
			fromDriver: (str) => JSON.parse(str) as { foo: string },
		});

		const table = pgTable('opaque', {
			blob: opaqueType('blob').notNull(),
		});
		const Row = createSelectSchema(table);

		// without an effect schema, decode is permissive — any value passes
		expect(s.decodeUnknownSync(Row)({ blob: 'anything' })).toEqual({ blob: 'anything' });
		expect(s.decodeUnknownSync(Row)({ blob: { foo: 'bar' } })).toEqual({ blob: { foo: 'bar' } });
	});
});
