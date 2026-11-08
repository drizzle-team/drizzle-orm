import { PGlite } from '@electric-sql/pglite';

let template: Promise<PGlite> | undefined;

/**
 * An empty PGlite database of its own: a clone of one started once per test worker and never used itself. Starting
 * a PGlite takes ~430 ms, cloning a started one ~100 ms, and some suites start one for each test. Close it as a
 * `new PGlite()`.
 */
export const freshPGlite = async (): Promise<PGlite> => {
	template ??= (async () => {
		const pglite = new PGlite();
		await pglite.waitReady;
		return pglite;
	})();
	// clone() is typed as returning the interface; it returns a PGlite.
	return (await template).clone() as unknown as Promise<PGlite>;
};
