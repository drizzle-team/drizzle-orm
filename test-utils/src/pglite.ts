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

const idle: PGlite[] = [];

/**
 * An empty PGlite database on loan. Give it back with `returnPGlite` instead of closing it: emptying a database for
 * its next borrower takes ~10 ms, a clone ~100 ms, and the migration-folder flows borrow one for every `migrate`.
 */
export const borrowPGlite = async (): Promise<PGlite> => idle.pop() ?? await freshPGlite();

/**
 * Gives back a borrowed PGlite, emptied: every schema but the system ones is dropped (public recreated) and every
 * role but the built-in ones. One that cannot be emptied is closed instead, and the error is thrown.
 */
export const returnPGlite = async (client: PGlite): Promise<void> => {
	try {
		await emptyPGlite(client);
	} catch (error) {
		await client.close().catch(() => {});
		throw error;
	}
	idle.push(client);
};

const emptyPGlite = async (client: PGlite) => {
	// A failed test may have left a transaction open. Without one this is only a warning.
	await client.query('ROLLBACK');
	const { rows: schemas } = await client.query<{ name: string }>(
		`select nspname as name from pg_namespace
		where nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and nspname not like 'pg\\_temp\\_%'
			and nspname not like 'pg\\_toast\\_%'`,
	);
	for (const { name } of schemas) await client.query(`drop schema "${name.replaceAll('"', '""')}" cascade`);
	await client.query('create schema public');

	const { rows: roles } = await client.query<{ name: string }>(
		`select rolname as name from pg_roles where rolname <> 'postgres' and rolname not like 'pg\\_%'`,
	);
	for (const { name } of roles) await client.query(`drop role "${name.replaceAll('"', '""')}"`);
};
