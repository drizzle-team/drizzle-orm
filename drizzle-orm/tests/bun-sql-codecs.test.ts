import { describe, it } from 'vitest';
import { bunSqlPgCodecs } from '~/bun-sql/postgres/codecs.ts';

describe.concurrent('bunSqlPgCodecs', () => {
	it('serializes scalar json values via normalizeParam', ({ expect }) => {
		const codec = bunSqlPgCodecs.json!;
		expect(codec.normalizeParam!({ key: 'value' })).toBe('{"key":"value"}');
		expect(codec.normalizeParam!([1, 2, 3])).toBe('[1,2,3]');
		expect(codec.normalizeParam!('plain string')).toBe('"plain string"');
		expect(codec.normalizeParam!(42)).toBe('42');
		expect(codec.normalizeParam!(null)).toBe('null');
	});

	it('serializes scalar jsonb values via normalizeParam', ({ expect }) => {
		const codec = bunSqlPgCodecs.jsonb!;
		expect(codec.normalizeParam!({ key: 'value' })).toBe('{"key":"value"}');
		expect(codec.normalizeParam!([1, 2, 3])).toBe('[1,2,3]');
	});

	it('serializes json arrays via normalizeParamArray', ({ expect }) => {
		const codec = bunSqlPgCodecs.json!;
		const input = [{ a: 1 }, { b: 2 }];
		const output = codec.normalizeParamArray!(input, 1);
		// Each element should be stringified, then wrapped in a PG array literal
		expect(output).toContain('"{\\"a\\":1}"');
		expect(output).toContain('"{\\"b\\":2}"');
	});
});
