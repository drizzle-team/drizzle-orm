import { describe, expect, test } from 'vitest';
import { dialects, type TestSchema } from './folder-flow';

// A seeded generator of migration histories. Each history is a chain of schemas that add and drop columns and
// add, drop and rename indexes, and the test checks that every snapshot reconstructs to the schema that wrote it,
// before and after `up` converts the folder.
const generator = (seed: number) => {
	let state = seed;
	return () => (state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
};

const states = (seed: number, count: number): TestSchema[] => {
	const random = generator(seed);
	// `name` stays in every state, because a step that drops a column with an index asks for a hint. The index
	// appears at the second step, so the history adds it once and keeps it.
	const optional = ['email', 'a', 'b', 'c'];
	const out: TestSchema[] = [];
	let columns = new Set(['id', 'name']);
	for (let step = 0; step < count; step++) {
		const column = optional[Math.floor(random() * optional.length)];
		if (columns.has(column)) columns.delete(column);
		else columns.add(column);
		out.push({ columns: [...columns].sort(), ...(step > 0 ? { indexOn: 'name' } : {}) });
	}
	return out;
};

describe.each(dialects)('folder fuzz for $name', (dialect) => {
	for (const seed of [1, 2, 3, 4, 5]) {
		test(`history from seed ${seed} reconstructs every state`, async () => {
			const flow = dialect.createFlow();
			const history = states(seed, 6);
			const folders: string[] = [];
			for (const state of history) folders.push((await flow.generate('main', state)).folder);

			for (const [idx, folder] of folders.entries()) {
				expect(flow.state('main', folder), folder).toStrictEqual(flow.schemaState(history[idx]));
			}
			expect(flow.leaves('main')).toStrictEqual([folders[folders.length - 1]]);
		});
	}

	test(`up rebuilds every state of a converted history`, async () => {
		const flow = dialect.createFlow();
		const history = states(11, 4);
		const folders: string[] = [];
		for (const state of history) folders.push((await flow.generate('main', state)).folder);
		const before = new Map(folders.map((folder) => [folder, flow.state('main', folder)]));

		flow.downgradeToOldFormat('main');
		await flow.up('main');

		for (const [folder, state] of before) {
			expect(flow.state('main', folder), folder).toStrictEqual(state);
		}
	});
});
