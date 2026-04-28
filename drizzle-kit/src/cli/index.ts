import { type BroCliEvent, command, getCommandNameWithParents, run } from '@drizzle-team/brocli';
import chalk from 'chalk';
import { isJsonMode, runWithCliContext } from './context';
import { DrizzleCliError } from './errors';
import { highlightSQL } from './highlighter';
import { check, exportRaw, generate, migrate, pull, push, studio, up } from './schema';
import { ormCoreVersions, QueryError } from './utils';
import { error, humanLog, printJsonOutput } from './views';

const writeStderr = (message: string) => {
	process.stderr.write(`${message}\n`);
};

const formatQueryError = (e: QueryError) => {
	let msg = `┌── ${chalk.bgRed.bold('query error:')} ${chalk.red(e.message)}\n\n`;
	msg += `${highlightSQL(e.sql)}\n`;
	if (e.params.length > 0) msg += '| ' + chalk.gray(`--- params: ${e.params || '[]'}\n\n`);
	msg += '└──';
	return msg;
};

const getBroCliErrorMessage = (event: BroCliEvent & { type: 'error' }) => {
	if (event.violation === 'missing_args_error') {
		return `Missing required arguments: ${event.missing.map((group) => group.join(' | ')).join(', ')}`;
	}

	if (event.violation === 'unrecognized_args_error') {
		return `Unrecognized arguments: ${event.unrecognized.join(', ')}`;
	}

	if (event.violation === 'unknown_command_error') {
		return `Unknown command: ${event.offender}`;
	}

	if (event.violation === 'unknown_subcommand_error') {
		return `Unknown subcommand: ${event.offender}`;
	}

	if (event.violation === 'unknown_error') {
		const candidate = event.error;
		if (candidate instanceof QueryError || candidate instanceof DrizzleCliError) {
			return candidate.message;
		}

		if (
			typeof candidate === 'object' && candidate !== null && 'message' in candidate
			&& typeof candidate.message === 'string'
		) {
			return candidate.message;
		}

		return 'Unknown error';
	}

	const optionName = 'option' in event ? event.option.name : 'option';
	const offender = 'offender' in event
		? [event.offender.namePart, event.offender.dataPart].filter(Boolean).join(' ')
		: '';
	return `Invalid value for --${optionName}${offender ? `: ${offender}` : ''}`;
};

const version = async () => {
	const { npmVersion } = await ormCoreVersions();
	const ormVersion = npmVersion ? `drizzle-orm: v${npmVersion}` : '';
	const envVersion = process.env.DRIZZLE_KIT_VERSION;
	const kitVersion = envVersion ? `v${envVersion}` : '--';
	const versions = `drizzle-kit: ${kitVersion}\n${ormVersion}`;
	humanLog(chalk.gray(versions), '\n');
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
				humanLog(
					`This command is deprecated. ${customMessage}`,
				);
				return;
			}
			humanLog(
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

const main = async () => {
	await runWithCliContext(
		{ json: process.argv.includes('--json') },
		async () => {
			await run([generate, migrate, pull, push, studio, up, check, exportRaw, ...legacy], {
				name: 'drizzle-kit',
				version: () => version(),

				hook: (event, command) => {
					if (event === 'after' && getCommandNameWithParents(command) !== 'studio') process.exit(0);
				},
				theme: (event) => {
					if (event.type === 'error') {
						if (isJsonMode()) {
							if (event.violation === 'unknown_error' && event.error instanceof QueryError) {
								writeStderr(formatQueryError(event.error));
								printJsonOutput({
									status: 'error',
									error: {
										code: 'query_error',
										sql: event.error.sql,
										params: event.error.params,
									},
								});
								return true;
							}

							const err = event.violation === 'unknown_error' && event.error instanceof DrizzleCliError
								? { code: event.error.code, ...event.error.meta }
								: { code: event.violation, message: getBroCliErrorMessage(event) };

							if (event.violation === 'unknown_error' && event.error instanceof DrizzleCliError) {
								writeStderr(event.error.humanMessage);
							} else {
								writeStderr(getBroCliErrorMessage(event));
							}

							printJsonOutput({
								status: 'error',
								error: err,
							});
							return true;
						}

						if (event.violation !== 'unknown_error') return false;

						const e = event.error;
						if (e instanceof QueryError) {
							const msg = formatQueryError(e);
							humanLog();
							humanLog(msg);
							return true;
						}

						if (e instanceof DrizzleCliError) {
							humanLog(e.humanMessage);
							return true;
						}

						if (
							!(typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string')
						) return false;

						humanLog(error(e.message));
						return true;
					}

					return false;
				},
			});
		},
	);
};

void main();
