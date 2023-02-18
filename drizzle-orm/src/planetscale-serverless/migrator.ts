import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { sql } from '~/sql';
import { PlanetScaleDatabase } from './driver';
import { PlanetscaleSession } from './session';

type BPS = { prev: number; acc: { sql: string; params?: any[] }[] };

export async function migrate(db: PlanetScaleDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
		id SERIAL PRIMARY KEY,
		hash text NOT NULL,
		created_at bigint
	)`;
	await db.session.execute(migrationTableCreate);

	const dbMigrations = await db.session.all<{ id: number; hash: string; created_at: string }>(
		sql`SELECT id, hash, created_at FROM \`__drizzle_migrations\` ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0];

	const queries: { sql: string; params?: any[] }[] = [];

	for (const migration of migrations) {
		if (
			!lastDbMigration
			|| parseInt(lastDbMigration.created_at, 10) < migration.folderMillis
		) {
			const result = migration.bps.reduce<BPS>((res, it) => {
				res.acc.push({ sql: migration.sql.slice(res.prev, it) });
				res.prev = it;
				return res;
			}, { prev: 0, acc: [] });

			queries.push(...result.acc);
			queries.push({
				sql: `INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES(?, ?)`,
				params: [migration.hash, migration.folderMillis],
			});
		}
	}

	await (db.session as PlanetscaleSession).transaction(queries);
}
