import type { MigrationConfig } from '~/migrator.ts';
import type { DSQLDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: DSQLDatabase<TSchema>,
	config: MigrationConfig,
): Promise<void> {
	throw new Error('Method not implemented.');
}
