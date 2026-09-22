import crypto from 'node:crypto';
import fs from 'node:fs';

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
	migrationsTable?: string;
	migrationsSchema?: string;
}

export interface MigrationMeta {
	sql: string[];
	folderMillis: number;
	hash: string;
	bps: boolean;
}

export function readMigrationFiles(config: MigrationConfig): MigrationMeta[] {
	const migrationFolderTo = config.migrationsFolder;

	const migrationQueries: MigrationMeta[] = [];

	const journalPath = `${migrationFolderTo}/meta/_journal.json`;
	if (!fs.existsSync(journalPath)) {
		throw new Error(`Can't find meta/_journal.json file`);
	}

	const journalAsString = fs.readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();

	const journal = JSON.parse(journalAsString) as {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};

	for (const journalEntry of journal.entries) {
		const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;

		try {
			const query = fs.readFileSync(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();

			const result = isFullyCommentedIntrospectFile(query)
				? []
				: query.split('--> statement-breakpoint').map((it) => {
					return it;
				});

			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: crypto.createHash('sha256').update(query).digest('hex'),
			});
		} catch {
			throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
		}
	}

	return migrationQueries;
}

// `drizzle-kit pull` emits introspect migrations as `-- ...` notes followed by
// the entire schema wrapped in a single `/* ... */` block. Treat such files as
// a no-op so they get marked applied without crashing the migrator.
function isFullyCommentedIntrospectFile(query: string): boolean {
	let body = query;
	while (true) {
		const trimmed = body.replace(/^\s+/, '');
		if (trimmed.startsWith('--')) {
			const newlineIdx = trimmed.indexOf('\n');
			body = newlineIdx === -1 ? '' : trimmed.slice(newlineIdx + 1);
			continue;
		}
		body = trimmed;
		break;
	}

	body = body.replace(/\s+$/, '');
	if (!body.startsWith('/*') || !body.endsWith('*/')) {
		return false;
	}

	const inner = body.slice(2, -2);
	return !inner.includes('*/');
}
