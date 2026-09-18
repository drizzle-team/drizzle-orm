import { PGlite } from '@electric-sql/pglite';
import { defineConfig } from '../../src';

const client = new PGlite();
// tag it so tests can tell this very instance apart from a freshly constructed one
// (the config is loaded through a separate module loader, so identity checks across it don't work)
(client as any).__fixtureTag = 'pglite-client.config.ts';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'postgresql',
	driver: 'pglite',
	client,
});
