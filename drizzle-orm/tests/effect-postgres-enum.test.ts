import { expect, test } from 'vitest';
import { effectPgCodecs } from '~/effect-postgres/codecs';
import { pgEnum, pgTable, QueryBuilder } from '~/pg-core';
import { makeDefaultQueryMapper, makeJitQueryMapper } from '~/utils';

const state = pgEnum('state', ['pending', '完了 🐘', '\uFEFFlabel']);
const items = pgTable('items', { state: state() });
const query = new QueryBuilder({ codecs: effectPgCodecs }).select().from(items);

for (const [name, makeMapper] of Object.entries({ default: makeDefaultQueryMapper, jit: makeJitQueryMapper })) {
	test(`scalar enum results decode UTF-8 bytes with the ${name} mapper`, () => {
		const mapper = makeMapper(query._resolveSelection(), undefined);
		const encoder = new TextEncoder();
		const labels = ['pending', '完了 🐘', '\uFEFFlabel'];
		const padded = encoder.encode('xpendingy');
		expect(mapper([[padded.subarray(1, -1)]])).toEqual([{ state: 'pending' }]);
		expect(mapper([...labels.map((label) => [encoder.encode(label)]), [null]]))
			.toEqual([...labels.map((state) => ({ state })), { state: null }]);
	});

	test(`scalar enum strings remain unchanged with the ${name} mapper`, () => {
		const mapper = makeMapper(query._resolveSelection(), undefined);
		expect(mapper([['pending'], ['完了 🐘'], [null]]))
			.toEqual([{ state: 'pending' }, { state: '完了 🐘' }, { state: null }]);
	});
}
