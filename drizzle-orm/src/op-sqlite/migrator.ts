import { useEffect, useReducer } from 'react';
import type { MigrationMeta } from '~/migrator.ts';
import { formatToMillis } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import type { OPSQLiteDatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	downMigrations?: Record<string, string>;
}

async function readMigrationFiles({ migrations, downMigrations }: MigrationConfig): Promise<MigrationMeta[]> {
	const migrationQueries: MigrationMeta[] = [];

	const sortedMigrations = Object.keys(migrations).sort();

	for (const key of sortedMigrations) {
		const query = migrations[key];
		if (!query) {
			throw new Error(`Missing migration: ${key}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			const migrationDate = formatToMillis(key.slice(0, 14));

			let downSql: string[] | undefined;
			const downQuery = downMigrations?.[key];
			if (downQuery?.trim()) {
				downSql = downQuery.trim().split('--> statement-breakpoint').map((it) => it);
			}

			migrationQueries.push({
				sql: result,
				downSql,
				bps: true,
				folderMillis: migrationDate,
				hash: '',
				name: key,
			});
		} catch {
			throw new Error(`Failed to parse migration: ${key}`);
		}
	}

	return migrationQueries;
}

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: OPSQLiteDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = await readMigrationFiles(config);
	return await db.dialect.migrate(migrations, db.session);
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: OPSQLiteDatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps: number = 1,
) {
	const migrations = await readMigrationFiles(config);
	return await db.dialect.rollback(migrations, db.session, undefined, steps);
}

interface State {
	success: boolean;
	error?: Error;
}

type Action =
	| { type: 'migrating' }
	| { type: 'migrated'; payload: true }
	| { type: 'error'; payload: Error };

export const useMigrations = (db: OPSQLiteDatabase<any, any>, migrations: {
	migrations: Record<string, string>;
}): State => {
	const initialState: State = {
		success: false,
		error: undefined,
	};

	const fetchReducer = (state: State, action: Action): State => {
		switch (action.type) {
			case 'migrating': {
				return { ...initialState };
			}
			case 'migrated': {
				return { ...initialState, success: action.payload };
			}
			case 'error': {
				return { ...initialState, error: action.payload };
			}
			default: {
				return state;
			}
		}
	};

	const [state, dispatch] = useReducer(fetchReducer, initialState);

	useEffect(() => {
		dispatch({ type: 'migrating' });
		migrate(db, migrations).then(() => {
			dispatch({ type: 'migrated', payload: true });
		}).catch((error) => {
			dispatch({ type: 'error', payload: error as Error });
		});
	}, []);

	return state;
};
