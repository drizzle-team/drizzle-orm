import { expect, test } from 'vitest';
import * as publicSurface from '../../src/index';

test("public surface exports exactly ['defineConfig']", () => {
	const keys = Object.keys(publicSurface).filter((k) => !k.startsWith('__') && k !== 'default').sort();
	expect(keys).toEqual(['defineConfig']);
});
