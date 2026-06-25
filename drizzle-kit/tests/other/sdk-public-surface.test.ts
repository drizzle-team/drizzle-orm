import { expect, test } from 'vitest';
import * as publicSurface from '../../src/index';

test("public surface exports exactly ['check','defineConfig','exportSql','generate','pull','push','up']", () => {
	const keys = Object.keys(publicSurface).filter((k) => !k.startsWith('__') && k !== 'default').sort();
	expect(keys).toEqual(['check', 'defineConfig', 'exportSql', 'generate', 'pull', 'push', 'up']);
});
