import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { NoopCache } from '~/cache/core/index.ts';
import { NoopLogger } from '~/logger.ts';
import { NodePgPreparedQuery } from '~/node-postgres/session.ts';

const { types } = pg;

const TIMESTAMPTZ_OID = types.builtins.TIMESTAMPTZ;

/**
 * Minimal stand-in for a `pg` client that emulates node-postgres row parsing:
 * it applies the query config's `types.getTypeParser` to raw text values and
 * falls back to pg's configured parsers when the config provides none —
 * exactly how node-postgres resolves the parser for a query.
 */
function makeFakePgClient(fields: { name: string; dataTypeID: number }[], rawRows: string[][]) {
	return {
		query: async (config: {
			types?: { getTypeParser: (oid: number, format: string) => (val: string) => unknown };
		}) => {
			const getTypeParser = config.types?.getTypeParser ?? types.getTypeParser.bind(types);
			const rows = rawRows.map((rawRow) =>
				Object.fromEntries(
					rawRow.map((value, i) => [fields[i]!.name, getTypeParser(fields[i]!.dataTypeID, 'text')(value)]),
				)
			);
			return { rows, rowCount: rows.length };
		},
	};
}

function makeRawQuery(client: unknown) {
	return new NodePgPreparedQuery(
		client as never,
		'select created_at from events',
		[],
		new NoopLogger(),
		new NoopCache(),
		undefined,
		undefined,
		undefined,
		undefined,
		false,
		undefined,
	);
}

async function executeRaw(client: unknown) {
	const result = await makeRawQuery(client).execute() as { rows: Record<string, unknown>[] };
	return result.rows[0]!['created_at'];
}

describe('node-postgres: db.execute() respects configured type parsers', () => {
	test('applies pg default parser for TIMESTAMPTZ (returns Date, like native pg)', async () => {
		const client = makeFakePgClient(
			[{ name: 'created_at', dataTypeID: TIMESTAMPTZ_OID }],
			[['2024-05-01 12:00:00+00']],
		);

		expect(await executeRaw(client)).toBeInstanceOf(Date);
	});

	test('applies user-configured type parser for TIMESTAMPTZ', async () => {
		const original = types.getTypeParser(TIMESTAMPTZ_OID, 'text');
		types.setTypeParser(TIMESTAMPTZ_OID, (val: string) => `custom:${val}`);
		try {
			const client = makeFakePgClient(
				[{ name: 'created_at', dataTypeID: TIMESTAMPTZ_OID }],
				[['2024-05-01 12:00:00+00']],
			);

			expect(await executeRaw(client)).toBe('custom:2024-05-01 12:00:00+00');
		} finally {
			types.setTypeParser(TIMESTAMPTZ_OID, original);
		}
	});

	test('db.all() applies pg default parser for TIMESTAMPTZ as well', async () => {
		const client = makeFakePgClient(
			[{ name: 'created_at', dataTypeID: TIMESTAMPTZ_OID }],
			[['2024-05-01 12:00:00+00']],
		);

		const rows = await makeRawQuery(client).all() as Record<string, unknown>[];
		expect(rows[0]!['created_at']).toBeInstanceOf(Date);
	});
});
