import { describe, expect, it, vi } from 'vitest';
import { NoopCache } from '~/cache/core/index.ts';
import { NoopLogger } from '~/logger.ts';
import { NodePgPreparedQuery } from '~/node-postgres/session.ts';

// Regression test for #6290: db.execute() (no Drizzle fields/custom mapper)
// silently applied Drizzle's internal identity type-parser overrides for
// TIMESTAMPTZ/TIMESTAMP/DATE/INTERVAL, returning raw strings instead of the
// Date objects a caller would get from plain node-postgres. Typed queries
// (which go through the fields/customResultMapper path) still need those
// overrides so Drizzle's own column decoders can do the conversion.
describe('NodePgPreparedQuery raw execute() type parsing', () => {
	function createQuery(fields: unknown[] | undefined) {
		const calls: any[] = [];
		const client = {
			query: vi.fn((config: any) => {
				calls.push(config);
				return Promise.resolve({ rows: [] });
			}),
		};

		const query = new NodePgPreparedQuery<any>(
			client as any,
			'select 1',
			[],
			new NoopLogger(),
			new NoopCache(),
			undefined,
			undefined,
			fields as any,
			undefined,
			false,
			undefined,
		);

		return { query, calls };
	}

	it('does not override node-postgres type parsers on the raw db.execute() path', async () => {
		const { query, calls } = createQuery(undefined);

		await query.execute();

		expect(calls).toHaveLength(1);
		expect(calls[0]!.types).toBeUndefined();
	});

	it('still overrides type parsers for typed (fields-mapped) queries', async () => {
		const { query, calls } = createQuery([]);

		await query.execute();

		expect(calls).toHaveLength(1);
		expect(typeof calls[0]!.types?.getTypeParser).toBe('function');
	});
});
