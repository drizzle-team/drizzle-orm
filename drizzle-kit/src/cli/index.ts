import { command, run } from '@drizzle-team/brocli';
import chalk from 'chalk';
import { check, drop, exportRaw, generate, migrate, pull, push, studio, up } from './schema';
import { ormCoreVersions } from './utils';

const version = async () => {
	const { npmVersion } = await ormCoreVersions();
	const ormVersion = npmVersion ? `drizzle-orm: v${npmVersion}` : '';
	const envVersion = process.env.DRIZZLE_KIT_VERSION;
	const kitVersion = envVersion ? `v${envVersion}` : '--';
	const versions = `drizzle-kit: ${kitVersion}\n${ormVersion}`;
	console.log(chalk.gray(versions), '\n');
};

const legacyCommand = (name: string, newName: string) => {
	return command({
		name,
		hidden: true,
		handler: () => {
			console.log(
				`This command is deprecated, please use updated '${newName}' command (see https://orm.drizzle.team/kit-docs/upgrade-21#how-to-migrate-to-0210)`,
			);
		},
	});
};

const legacy = [
	legacyCommand('generate:pg', 'generate'),
	legacyCommand('generate:mysql', 'generate'),
	legacyCommand('generate:sqlite', 'generate'),
	legacyCommand('push:pg', 'push'),
	legacyCommand('push:mysql', 'push'),
	legacyCommand('push:sqlite', 'push'),
	legacyCommand('introspect:pg', 'introspect'),
	legacyCommand('introspect:mysql', 'introspect'),
	legacyCommand('introspect:sqlite', 'introspect'),
	legacyCommand('up:pg', 'up'),
	legacyCommand('up:mysql', 'up'),
	legacyCommand('up:sqlite', 'up'),
	legacyCommand('check:pg', 'check'),
	legacyCommand('check:mysql', 'check'),
	legacyCommand('check:sqlite', 'check'),
];

run([generate, migrate, pull, push, studio, up, check, drop, exportRaw, ...legacy], {
	name: 'drizzle-kit',
	version: version,
});
