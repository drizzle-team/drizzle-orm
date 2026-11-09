import { originUUID } from 'src/utils';
import { describe, expect, test } from 'vitest';
import { dialects, type Flow, rename, type TestSchema } from './folder-flow';

// Runs the same folder flow for postgres and cockroach. A dialect adds only its schema builder, its CLI handlers
// and its folder reader; the assertions below are the same for both.
const base: TestSchema = { columns: ['id', 'name'] };

const foldersOf = (flow: Flow, branch: string) => flow.folders(branch);

describe.each(dialects)('folder flow for $name', (dialect) => {
	test('generate writes a base snapshot and then a diff snapshot', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		const second = await flow.generate('main', { columns: ['id', 'name', 'email'] });

		const [firstFolder] = foldersOf(flow, 'main');
		const first = flow.snapshot('main', firstFolder);
		const diff = flow.snapshot('main', second.folder);
		expect(first.type).toBe('base');
		expect(diff.type).toBe('diff');
		expect(diff.deltas.length).toBeGreaterThan(0);
		expect(diff.footprints).toHaveLength(diff.deltas.length);
		expect(diff).not.toHaveProperty('ddl');
		expect(flow.state('main', second.folder)).toStrictEqual(
			flow.schemaState({ columns: ['id', 'name', 'email'] }),
		);
	});

	test('a fork writes one merge snapshot with every leaf as a parent', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		flow.branch('a', 'main');
		flow.branch('b', 'main');
		await flow.generate('a', { columns: ['id', 'name', 'a'] });
		await flow.generate('b', { columns: ['id', 'name', 'b'] });
		expect(flow.leaves('main')).toHaveLength(1);
		flow.merge('main', 'a', 'b');
		expect(flow.leaves('main')).toHaveLength(2);

		const merged = await flow.generate('main', { columns: ['id', 'name', 'a', 'b', 'c'] });
		const snapshot = flow.snapshot('main', merged.folder);
		expect(snapshot.type).toBe('diff');
		expect(snapshot.prevIds).toHaveLength(2);
		expect(flow.leaves('main')).toStrictEqual([merged.folder]);
		expect(flow.state('main', merged.folder)).toStrictEqual(
			flow.schemaState({ columns: ['id', 'name', 'a', 'b', 'c'] }),
		);
	});

	test('a rename against an index on the renamed column is reported and fixed', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		flow.branch('a', 'main');
		flow.branch('b', 'main');
		await flow.generate('a', { columns: ['id', 'full_name'] }, { hints: [rename.column('name', 'full_name')] });
		await flow.generate('b', { columns: ['id', 'name'], indexOn: 'name' });
		flow.merge('main', 'a', 'b');

		const before = await flow.check('main');
		expect(before.status).toBe('conflicts');
		if (before.status !== 'conflicts') throw new Error('no conflict');
		expect(before.folders).toHaveLength(2);

		const fixed = await flow.generate(
			'main',
			{ columns: ['id', 'full_name'], indexOn: 'full_name' },
			{ fixConflicts: true, hints: [rename.column('name', 'full_name')] },
		);
		expect([...fixed.deleted].sort()).toStrictEqual([...before.fix].sort());
		expect((await flow.check('main')).status).toBe('passed');
		expect(flow.state('main', fixed.folder)).toStrictEqual(
			flow.schemaState({ columns: ['id', 'full_name'], indexOn: 'full_name' }),
		);
	});

	test('a custom migration stores no footprints', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		const custom = await flow.generate('main', base, { custom: true });

		const snapshot = flow.snapshot('main', custom.folder);
		expect(snapshot.type).toBe('diff');
		expect(snapshot.footprints).toStrictEqual([]);
		expect(snapshot.deltas).toStrictEqual([]);
	});

	test('up converts an old folder and keeps every state', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		await flow.generate('main', { columns: ['id', 'name', 'email'] });
		const before = new Map(foldersOf(flow, 'main').map((folder) => [folder, flow.state('main', folder)]));

		flow.downgradeToOldFormat('main');
		await flow.up('main');

		for (const [folder, state] of before) {
			expect(flow.state('main', folder), folder).toStrictEqual(state);
		}
		const versions = foldersOf(flow, 'main').map((folder) => flow.snapshot('main', folder).version);
		expect(versions).toStrictEqual(dialect.name === 'postgres' ? ['9', '9'] : ['2', '2']);
	});

	test('a missing migration stops the check and changes no file', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		await flow.generate('main', { columns: ['id', 'name', 'email'] });
		await flow.generate('main', { columns: ['id', 'name', 'email', 'a'] });

		const [, middle] = foldersOf(flow, 'main');
		const filesBefore = flow.files('main').filter(([path]) => !path.startsWith(`${middle}/`));
		flow.deleteFolder('main', middle);

		await expect(flow.check('main')).rejects.toThrow(/is missing from the migrations folder/);
		expect(flow.files('main')).toStrictEqual(filesBefore);
	});

	test('an unparseable snapshot stops the check and changes no file', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		const second = await flow.generate('main', { columns: ['id', 'name', 'email'] });

		flow.overwriteSnapshot('main', second.folder, '{');
		const filesBefore = flow.files('main');

		await expect(flow.check('main')).rejects.toThrow(/malformed|Restore the file/);
		expect(flow.files('main')).toStrictEqual(filesBefore);
	});

	test('two base snapshots stop the check', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		const second = await flow.generate('main', { columns: ['id', 'name', 'email'] });

		const snapshot = flow.snapshot('main', second.folder);
		flow.overwriteSnapshot(
			'main',
			second.folder,
			JSON.stringify({ ...snapshot, type: 'base', prevIds: [originUUID], deltas: undefined, ddl: [] }),
		);

		await expect(flow.check('main')).rejects.toThrow(/two base snapshots/);
	});

	test('a migration that sorts before its parent stops the check', async () => {
		const flow = dialect.createFlow();
		await flow.generate('main', base);
		const second = await flow.generate('main', { columns: ['id', 'name', 'email'] });

		flow.renameFolder('main', second.folder, `0000_${second.folder}`);
		await expect(flow.check('main')).rejects.toThrow(/sorts before its parent/);
	});
});
