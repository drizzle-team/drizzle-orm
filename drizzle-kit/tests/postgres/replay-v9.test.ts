import { readFileSync } from 'fs';
import { join } from 'path';
import { expect, test } from 'vitest';

// The replay is part of snapshot format 9. With an import, an edit to another module could change how an
// existing folder rebuilds, with no error.
test('the format 9 replay imports no other module', () => {
	const source = readFileSync(join(import.meta.dirname, '../../src/dialects/postgres/replay-v9.ts'), 'utf8');

	expect(source.match(/^\s*import\b.*|\bfrom\s+['"].*|\b(import|require)\s*\(.*/gm)).toBeNull();
});
