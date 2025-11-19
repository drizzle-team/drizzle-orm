import { command, run } from '@drizzle-team/brocli';
import chalk from 'chalk';
import { check, exportRaw, generate, migrate, pull, push, studio, up } from './schema';
import { ormCoreVersions } from './utils';

const version = async () => {
	const { npmVersion } = await ormCoreVersions();
	const ormVersion = npmVersion ? `drizzle-orm: v${npmVersion}` : '';
	const envVersion = process.env.DRIZZLE_KIT_VERSION;
	const kitVersion = envVersion ? `v${envVersion}` : '--';
	const versions = `drizzle-kit: ${kitVersion}\n${ormVersion}`;
	console.log(chalk.gray(versions), '\n');
};

const legacyCommand = (
	{ name, newName, customMessage }: { name: string; newName?: string; customMessage?: string },
) => {
	return command({
		name,
		hidden: true,
		handler: () => {
			// in this case command was deleted and there is no new command
			if (!newName) {
				console.log(
					`This command is deprecated. ${customMessage}`,
				);
			}
			console.log(
				`This command is deprecated, please use updated '${newName}' command (see https://orm.drizzle.team/kit-docs/upgrade-21#how-to-migrate-to-0210)`,
			);
		},
	});
};

const legacy = [
	legacyCommand({ name: 'generate:pg', newName: 'generate' }),
	legacyCommand({ name: 'generate:mysql', newName: 'generate' }),
	legacyCommand({ name: 'generate:sqlite', newName: 'generate' }),
	legacyCommand({ name: 'push:pg', newName: 'push' }),
	legacyCommand({ name: 'push:mysql', newName: 'push' }),
	legacyCommand({ name: 'push:sqlite', newName: 'push' }),
	legacyCommand({ name: 'introspect:pg', newName: 'introspect' }),
	legacyCommand({ name: 'introspect:mysql', newName: 'introspect' }),
	legacyCommand({ name: 'introspect:sqlite', newName: 'introspect' }),
	legacyCommand({ name: 'up:pg', newName: 'up' }),
	legacyCommand({ name: 'up:mysql', newName: 'up' }),
	legacyCommand({ name: 'up:sqlite', newName: 'up' }),
	legacyCommand({ name: 'check:pg', newName: 'check' }),
	legacyCommand({ name: 'check:mysql', newName: 'check' }),
	legacyCommand({ name: 'check:sqlite', newName: 'check' }),

	// after folders v3 update
	legacyCommand({ name: 'drop', customMessage: 'To drop a migration you can remove a migration folder manually' }),
];

run([generate, migrate, pull, push, studio, up, check, exportRaw, ...legacy], {
	name: 'drizzle-kit',
	version: version,
});
