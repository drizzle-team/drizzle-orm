import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import type { Dialect } from '../../utils/schemaValidator';
import { assertV3OutFolder, prepareOutFolder } from '../../utils/utils-node';
import { SquashCliError } from '../errors';
import { humanLog } from '../views';
import { embeddedMigrations } from './generate-common';

export type SquashConfig = {
	out: string;
	dialect: Dialect;
	start: number;
	end: number;
};

export type SquashHandlerResult =
	| { status: 'ok'; dialect: Dialect; squashed: string[]; created: string }
	| { status: 'no_changes'; dialect: Dialect };

type MigrationEntry = {
	folder: string;
	snapshotPath: string;
	sqlPath: string;
	id: string;
	prevIds: string[];
};

const collectEntries = (out: string): MigrationEntry[] => {
	const { snapshots } = prepareOutFolder(out);

	return snapshots.map((snapshotPath) => {
		const folder = basename(dirname(snapshotPath));
		const sqlPath = join(dirname(snapshotPath), 'migration.sql');
		if (!existsSync(sqlPath)) {
			throw new SquashCliError(`No migration.sql file was found in '${folder}' folder`, {
				folder,
			});
		}

		let snapshot: { id?: unknown; prevIds?: unknown };
		try {
			snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
		} catch {
			throw new SquashCliError(`Failed to read snapshot in '${folder}' folder`, { folder });
		}

		if (typeof snapshot.id !== 'string' || !Array.isArray(snapshot.prevIds)) {
			throw new SquashCliError(
				`Snapshot in '${folder}' folder is malformed: 'id' and 'prevIds' fields are required`,
				{ folder },
			);
		}

		return {
			folder,
			snapshotPath,
			sqlPath,
			id: snapshot.id,
			prevIds: snapshot.prevIds as string[],
		};
	});
};

const assertSimpleChain = (entries: MigrationEntry[], squashedEntries: MigrationEntry[]) => {
	const squashedIds = new Set(squashedEntries.map((it) => it.id));
	const lastId = squashedEntries[squashedEntries.length - 1]!.id;

	for (const entry of entries) {
		if (squashedIds.has(entry.id)) {
			// Any squashed migration except the first one must only have
			// parents inside the squashed range, otherwise the range has a
			// merge point and can't be replaced with a single migration
			if (entry !== squashedEntries[0]) {
				for (const prevId of entry.prevIds) {
					if (!squashedIds.has(prevId)) {
						throw new SquashCliError(
							`Migration '${entry.folder}' has a parent outside of the squashed range. Squashing migrations with merged branches is not supported`,
							{ folder: entry.folder },
						);
					}
				}
			}
		} else {
			// Any migration outside of the range must only reference the last
			// squashed migration, otherwise the range has a branch and
			// squashing would corrupt the snapshot chain
			for (const prevId of entry.prevIds) {
				if (squashedIds.has(prevId) && prevId !== lastId) {
					throw new SquashCliError(
						`Migration '${entry.folder}' branches off the middle of the squashed range. Squashing migrations with branches is not supported`,
						{ folder: entry.folder },
					);
				}
			}
		}
	}
};

export const squashHandler = (config: SquashConfig): SquashHandlerResult => {
	const { out, dialect, start, end } = config;

	assertV3OutFolder(out);

	const entries = collectEntries(out);
	if (entries.length === 0) {
		throw new SquashCliError(`No migrations were found in '${out}' folder`, { out });
	}

	if (
		!Number.isInteger(start) || !Number.isInteger(end)
		|| start < 0 || end < start || end >= entries.length
	) {
		throw new SquashCliError(
			`Invalid range ${start}-${end}: 'start' and 'end' must be indexes of existing migrations (0-${
				entries.length - 1
			})`,
			{ start, end },
		);
	}

	const squashedEntries = entries.slice(start, end + 1);
	if (squashedEntries.length === 1) {
		return { status: 'no_changes', dialect };
	}

	assertSimpleChain(entries, squashedEntries);

	humanLog(
		`[✓] Found ${squashedEntries.length} migrations to squash (${squashedEntries[0]!.folder} through ${
			squashedEntries[squashedEntries.length - 1]!.folder
		})`,
	);

	// The squashed migration reuses the first folder name to keep its position
	// in the migration order
	const newFolder = squashedEntries[0]!.folder;
	const lastSnapshot = JSON.parse(
		readFileSync(squashedEntries[squashedEntries.length - 1]!.snapshotPath, 'utf-8'),
	) as Record<string, unknown>;

	// Keep the id of the last squashed snapshot, so migrations generated after
	// the range stay connected. Replace prevIds with the ones of the first
	// squashed snapshot, so the history before the range stays connected
	lastSnapshot.prevIds = squashedEntries[0]!.prevIds;

	const combinedSql = squashedEntries
		.map(
			(entry) =>
				`-- Start migration ${entry.folder}\n${readFileSync(entry.sqlPath, 'utf-8')}\n-- End migration ${entry.folder}`,
		)
		.join('\n');

	for (const entry of squashedEntries) {
		rmSync(dirname(entry.snapshotPath), { recursive: true, force: true });
	}

	const newFolderPath = join(out, newFolder);
	mkdirSync(newFolderPath);
	writeFileSync(join(newFolderPath, 'snapshot.json'), JSON.stringify(lastSnapshot, null, 2));
	writeFileSync(join(newFolderPath, 'migration.sql'), combinedSql);

	// Regenerate the migrations bundle for Expo / Durable SQLite drivers
	const bundlePath = join(out, 'migrations.js');
	if (existsSync(bundlePath)) {
		const previousBundle = readFileSync(bundlePath, 'utf-8');
		const driver = previousBundle.includes('Expo/React Native') ? 'expo' : undefined;
		const { snapshots } = prepareOutFolder(out);
		writeFileSync(bundlePath, embeddedMigrations(snapshots, driver));
	}

	humanLog(`[✓] Successfully squashed ${squashedEntries.length} migrations into ${newFolder}`);
	humanLog(`[i] Removed: ${squashedEntries.map((it) => it.folder).join(', ')}`);
	humanLog(`[i] Created: ${newFolder}`);

	return {
		status: 'ok',
		dialect,
		squashed: squashedEntries.map((it) => it.folder),
		created: newFolder,
	};
};
