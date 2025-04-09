import { useEffect, useReducer } from 'react';
import type { MigrationMeta } from '~/migrator.ts';
import type { OPSQLiteDatabase } from './driver.ts';

interface MigrationConfig {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
}

async function readMigrationFiles({ journal, migrations }: MigrationConfig): Promise<MigrationMeta[]> {
	const migrationQueries: MigrationMeta[] = [];

	for await (const journalEntry of journal.entries) {
		const query = migrations[`m${journalEntry.idx.toString().padStart(4, '0')}`];

		if (!query) {
			throw new Error(`Missing migration: ${journalEntry.tag}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: '',
			});
		} catch {
			throw new Error(`Failed to parse migration: ${journalEntry.tag}`);
		}
	}

	return migrationQueries;
}

export async function migrate<TSchema extends Record<string, unknown>>(
	db: OPSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = await readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session);
}

interface State {
	success: boolean;
	error?: Error;
}

type Action =
	| { type: 'migrating' }
	| { type: 'migrated'; payload: true }
	| { type: 'error'; payload: Error };

export const useMigrations = (db: OPSQLiteDatabase<any>, migrations: {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
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
