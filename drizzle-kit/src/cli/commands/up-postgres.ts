import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { basename, dirname } from 'path';
import { normalizeDDL } from '../../dialects/ddl-canonical';
import { fromEntities } from '../../dialects/postgres/ddl';
import { type PostgresSnapshot, reconstruct, snapshotValidator } from '../../dialects/postgres/snapshot';
import { upToV8 } from '../../dialects/postgres/versions';
import { upToV9, withStateKeyNames } from '../../dialects/postgres/versions-v9';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { migrateToFoldersV3 } from './utils';

const entityName = (json: string) => {
	const row = JSON.parse(json);
	return `${row.entityType} ${[row.schema, row.table, row.name].filter(Boolean).join('.')}`;
};

const reportIssueHint =
	'Keep the current snapshot files and report this issue at https://github.com/drizzle-team/drizzle-orm/issues.';

const conversionError = (folder: string, reason: string, next: string, meta: Record<string, string>) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert migration ${folder} to snapshot format 9: ${reason}. No snapshot was converted. ${next}`,
		meta,
	);

export const upPgHandler = async (out: string): Promise<string[]> => {
	migrateToFoldersV3(out);

	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'postgresql');

	if (report.nonLatest.length > 0) {
		const files = snapshots.map((path) => {
			const raw = report.rawMap[path];
			return { path, folder: basename(dirname(path)), snapshot: Number(raw.version) < 8 ? upToV8(raw).snapshot : raw };
		});
		// The loader validates only format 9 files.
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
		const snapshotTexts = (await upToV9(files)).map((it) => JSON.stringify(it, null, 2));

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
			const expected = normalizeDDL(fromEntities(withStateKeyNames(snapshot.ddl, state)).entities.list());
			const rebuilt = normalizeDDL(state.entities.list());
			const expectedSet = new Set(expected);
			const rebuiltSet = new Set(rebuilt);
			const differing = expected.find((it) => !rebuiltSet.has(it)) ?? rebuilt.find((it) => !expectedSet.has(it));
			if (differing) {
				const entity = entityName(differing);
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
		}

		for (const [idx, { path, snapshot }] of files.entries()) {
			if (snapshot.version === '9') continue;
			writeFileSync(path, snapshotTexts[idx]);
			if (outputFormat() === 'text') console.log(`[${chalk.green('✓')}] ${path}`);
		}
	}

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return report.nonLatest;
};
