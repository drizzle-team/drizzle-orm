import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fromEntities } from '../../dialects/postgres/ddl';
import {
	type PostgresSnapshot,
	reconstruct,
	snapshotValidator,
	stateDifference,
} from '../../dialects/postgres/snapshot';
import { upToV8 } from '../../dialects/postgres/versions';
import { UnsupportedMergeError, upToV9, withStateKeyNames } from '../../dialects/postgres/versions-v9';
import { originUUID } from '../../utils';
import {
	assertSnapshotStatus,
	folderOrderError,
	listSnapshots,
	sortsAfter,
	validateWithReport,
} from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError, DrizzleCliError } from '../errors';
import { applyFoldersV3, planFoldersV3 } from './utils';

const reportIssueHint =
	'Keep the current snapshot files and report this issue at https://github.com/drizzle-team/drizzle-orm/issues.';

const conversionError = (folder: string, reason: string, next: string, meta: Record<string, string>) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert migration ${folder} to snapshot format 9: ${reason}. No snapshot was converted. ${next}`,
		meta,
	);

const troubleshootingUrl = 'https://orm.drizzle.team/docs/kit-migrations-troubleshooting';

// The history of the folder cannot be converted. `reason` and `fix` are full sentences.
const historyError = (reason: string, fix: string, meta: Record<string, string> = {}) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert the migrations folder to snapshot format 9: ${reason} No file was changed. ${fix} `
			+ `See ${troubleshootingUrl}`,
		{ kind: 'history', ...meta },
	);

// Nothing is moved or written before every snapshot is converted and checked, so a failure leaves the
// folder as it was. A journal folder (the drizzle-kit 0.x layout) is read in place and moved last.
export const upPgHandler = async (out: string): Promise<string[]> => {
	const moves = planFoldersV3(out);
	const withoutSql = moves?.find((it) => !it.sqlPath);
	if (withoutSql) {
		const sql = join(out, `${withoutSql.tag}.sql`);
		throw historyError(
			`the journal entry ${withoutSql.tag} has no SQL file. drizzle-kit expects it at ${sql}.`,
			'Restore this file from git, then run drizzle-kit up again.',
			{ entry: withoutSql.tag, sql },
		);
	}

	// `path` is where the file is now, and `name` is how the user knows the migration now, so that an error
	// names things that exist. `folder` is the migration folder after the move.
	const sources = moves
		? moves.map((it) => ({ path: it.snapshotPath, folder: it.folder, name: it.tag }))
		: listSnapshots(out).map((path) => ({ path, folder: basename(dirname(path)), name: basename(dirname(path)) }));
	for (const { path } of sources) {
		try {
			JSON.parse(readFileSync(path, 'utf8'));
		} catch {
			assertSnapshotStatus(path, 'malformed');
		}
	}
	const report = validateWithReport(sources.map((it) => it.path), 'postgresql');

	// A folder that holds only format 9 snapshots is not validated here. `check` does that.
	const converted: { path: string; text: string }[] = [];
	if (report.nonLatest.length > 0) {
		const files = sources.map((it) => {
			const raw = report.rawMap[it.path];
			return { ...it, snapshot: Number(raw.version) < 8 ? upToV8(raw).snapshot : raw };
		}).sort((a, b) => (a.folder < b.folder ? -1 : 1));
		// validateWithReport checks the shape of format 9 files only, so a format 8 file needs this check.
		const malformedFile = files.find(({ path, snapshot }) =>
			report.malformed.includes(path)
			|| (snapshot.version === '8' && !(Array.isArray(snapshot.ddl) && Array.isArray(snapshot.prevIds)))
		);
		if (malformedFile) {
			throw conversionError(
				malformedFile.folder,
				'its snapshot.json is malformed',
				`Restore ${malformedFile.path} from git, then run drizzle-kit up again.`,
				{ kind: 'malformed', snapshot: malformedFile.path },
			);
		}

		const fileOf = new Map(files.map((it) => [it.snapshot.id as string, it]));
		for (const file of files) {
			for (const parentId of file.snapshot.prevIds as string[]) {
				if (!parentId || parentId === originUUID) continue;
				const parent = fileOf.get(parentId);
				if (!parent) {
					throw historyError(
						`a migration was deleted in the middle of the history. Migration ${file.name} follows the snapshot `
							+ `${parentId}, and no migration in the folder has this snapshot.`,
						`Restore the missing migration from git. If that is not possible, delete ${file.name} and every later `
							+ 'migration, run drizzle-kit up, and generate them again.',
						{ snapshot: file.path, parentId },
					);
				}
				if (!sortsAfter(file.folder, parent.folder)) throw folderOrderError(file, parent);
			}
		}

		let snapshotTexts: string[];
		try {
			snapshotTexts = (await upToV9(files)).map((it) => JSON.stringify(it, null, 2));
		} catch (e) {
			if (e instanceof DrizzleCliError) throw e;
			if (e instanceof UnsupportedMergeError) {
				const snapshot = files.find((it) => it.folder === e.folder)!.path;
				throw historyError(e.message, 'Snapshot format 9 does not support a merge of such branches.', { snapshot });
			}
			throw historyError((e as Error).message, reportIssueHint);
		}

		// The files are checked in the form that is written to disk.
		const written = snapshotTexts.map((it) => JSON.parse(it) as PostgresSnapshot);
		const byId = new Map(written.map((it) => [it.id, it]));
		for (const [idx, { path, folder, snapshot }] of files.entries()) {
			if (snapshot.version === '9') continue;
			const { errors } = snapshotValidator.parse(written[idx]);
			if (errors) {
				throw conversionError(folder, `the new snapshot is not valid (${errors.join('; ')})`, reportIssueHint, {
					kind: 'invalid_snapshot',
					snapshot: path,
				});
			}
			const state = reconstruct(byId, snapshot.id);
			const entity = stateDifference(fromEntities(withStateKeyNames(snapshot.ddl, state)), state);
			if (entity !== undefined) {
				throw conversionError(
					folder,
					`its rebuilt state differs from the format 8 state at ${entity}`,
					reportIssueHint,
					{
						kind: 'state_mismatch',
						snapshot: path,
						entity,
					},
				);
			}
			converted.push({ path: join(out, folder, 'snapshot.json'), text: snapshotTexts[idx] });
		}
	}

	if (moves) applyFoldersV3(out, moves);
	for (const { path, text } of converted) {
		writeFileSync(path, text);
		if (outputFormat() === 'text') console.log(`[${chalk.green('✓')}] ${path}`);
	}

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return converted.map((it) => it.path);
};
