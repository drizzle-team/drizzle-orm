import { join } from 'path';
import { reconstruct, stateHash } from 'src/dialects/postgres/snapshot';
import { expect, test } from 'vitest';
import { createFolderFlow } from './folder-flow';

// drizzle-kit wrote the folder `format-9-history` once, with snapshot format 9. It has 14 migrations: a
// fork of two branches with a merge, a custom migration, every delta and instruction op, a table move, and
// renames of a schema, a table, a column, an enum, an index, a constraint and a role.
//
// Do not generate the folder again to make these tests pass. A failure means that the code rebuilds an
// existing folder in another way, and then it also rebuilds the folders of users in another way. A change
// to the replay needs a new snapshot format with its own replay module. This folder then stays, as the
// test of format 9.
const seeded = () => {
	const flow = createFolderFlow();
	flow.seed('main', join(import.meta.dirname, 'format-9-history'));
	return flow;
};

test('every snapshot of the committed format 9 folder rebuilds to the state that it recorded', () => {
	const history = seeded().history('main');

	expect(history.size).toBe(14);
	for (const snapshot of history.values()) {
		expect(stateHash(reconstruct(history, snapshot.id)), snapshot.id).toBe(snapshot.stateHash);
	}
});

test('check passes on the committed format 9 folder', async () => {
	expect(await seeded().check('main')).toStrictEqual({ status: 'passed' });
});

// The reference is the database that the SQL of the folder gives, and not a stored state. A stored state
// can be written again by the same wrong code.
test('the SQL of the committed format 9 folder gives the database that the snapshots rebuild', async () => {
	const flow = seeded();
	const history = flow.history('main');

	expect(flow.leaves('main')).toHaveLength(1);
	for (const leaf of flow.leaves('main')) {
		const state = reconstruct(history, flow.snapshot('main', leaf).id);
		expect(await flow.migrate('main', state)).toStrictEqual([]);
	}
});
