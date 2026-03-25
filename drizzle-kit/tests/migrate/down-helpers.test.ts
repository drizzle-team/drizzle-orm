import { describe, expect, test } from 'vitest';
import { makeInverseResolver, withCapture } from 'src/cli/commands/generate-down-helpers';
import type { Resolver } from 'src/dialects/common';

type Entity = { name: string; schema?: string; table?: string };

describe('withCapture', () => {
	test('captures renames from the wrapped resolver', async () => {
		const store: { from: Entity; to: Entity }[] = [];

		const mockResolver: Resolver<Entity> = async ({ created, deleted }) => ({
			created: created.filter((c) => c.name !== 'new_name'),
			deleted: deleted.filter((d) => d.name !== 'old_name'),
			renamedOrMoved: [{ from: { name: 'old_name' }, to: { name: 'new_name' } }],
		});

		const wrapped = withCapture(mockResolver, store);
		const result = await wrapped({
			created: [{ name: 'new_name' }, { name: 'other_new' }],
			deleted: [{ name: 'old_name' }, { name: 'other_old' }],
		});

		expect(store).toHaveLength(1);
		expect(store[0]!.from.name).toBe('old_name');
		expect(store[0]!.to.name).toBe('new_name');
		// Original result is returned unchanged
		expect(result.renamedOrMoved).toHaveLength(1);
		expect(result.created).toHaveLength(1);
		expect(result.deleted).toHaveLength(1);
	});

	test('works with no renames', async () => {
		const store: { from: Entity; to: Entity }[] = [];

		const mockResolver: Resolver<Entity> = async ({ created, deleted }) => ({
			created,
			deleted,
			renamedOrMoved: [],
		});

		const wrapped = withCapture(mockResolver, store);
		await wrapped({
			created: [{ name: 'a' }],
			deleted: [{ name: 'b' }],
		});

		expect(store).toHaveLength(0);
	});
});

describe('makeInverseResolver', () => {
	test('inverts a rename correctly', async () => {
		const forwardRenames = [{ from: { name: 'old_table' }, to: { name: 'new_table' } }];

		const resolver = makeInverseResolver(forwardRenames);

		// In the reverse diff: new_table appears in deleted, old_table in created
		const result = await resolver({
			created: [{ name: 'old_table' }, { name: 'genuinely_new' }],
			deleted: [{ name: 'new_table' }, { name: 'genuinely_deleted' }],
		});

		expect(result.renamedOrMoved).toHaveLength(1);
		expect(result.renamedOrMoved[0]!.from.name).toBe('new_table');
		expect(result.renamedOrMoved[0]!.to.name).toBe('old_table');

		expect(result.created).toHaveLength(1);
		expect(result.created[0]!.name).toBe('genuinely_new');

		expect(result.deleted).toHaveLength(1);
		expect(result.deleted[0]!.name).toBe('genuinely_deleted');
	});

	test('handles multiple renames', async () => {
		const forwardRenames = [
			{ from: { name: 'a' }, to: { name: 'b' } },
			{ from: { name: 'c' }, to: { name: 'd' } },
		];

		const resolver = makeInverseResolver(forwardRenames);

		const result = await resolver({
			created: [{ name: 'a' }, { name: 'c' }],
			deleted: [{ name: 'b' }, { name: 'd' }],
		});

		expect(result.renamedOrMoved).toHaveLength(2);
		expect(result.created).toHaveLength(0);
		expect(result.deleted).toHaveLength(0);
	});

	test('handles no renames (passthrough)', async () => {
		const resolver = makeInverseResolver([]);

		const result = await resolver({
			created: [{ name: 'x' }],
			deleted: [{ name: 'y' }],
		});

		expect(result.renamedOrMoved).toHaveLength(0);
		expect(result.created).toHaveLength(1);
		expect(result.deleted).toHaveLength(1);
	});
});
