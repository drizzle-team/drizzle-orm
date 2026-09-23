export type TursoDriver = '@libsql/client' | '@tursodatabase/serverless' | '@tursodatabase/database';

/**
 * Picks the driver to use for `dialect: 'turso'`, in order of preference.
 *
 * The current-generation Turso SDKs win over '@libsql/client'. The legacy client is an
 * optional peer of drizzle-orm, so a stale transitive copy can stay resolvable long after a
 * project has migrated off it, and it rejects the `turso://` URLs Turso Cloud now issues.
 *
 * '@tursodatabase/database' is local-only, so it is preferred for local databases and
 * skipped entirely for remote ones, leaving '@libsql/client' as the remote fallback.
 */
export const pickTursoDriver = async (
	isRemote: boolean,
	has: (pkg: string) => Promise<boolean>,
): Promise<TursoDriver | undefined> => {
	if (!isRemote && await has('@tursodatabase/database')) return '@tursodatabase/database';
	if (await has('@tursodatabase/serverless')) return '@tursodatabase/serverless';
	if (await has('@libsql/client')) return '@libsql/client';
	return undefined;
};
