import { resolve } from 'path';
import { expect, test } from 'vitest';
import { loadModule } from '../../src/utils/utils-node';

test('loadModule resolves tsconfig paths', async () => {
	const modulePath = resolve('tests/fixtures/tsconfig-paths/entry.ts');
	const mod = await loadModule<{ profile?: unknown; user?: unknown }>(modulePath);

	expect(mod.profile).toBeDefined();
	expect(mod.user).toBeDefined();
});
