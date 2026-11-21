import { parse as parseDotenv } from 'dotenv';
import { readFileSync } from 'fs';

// Parses --env-file occurrences out of an argv array, returning the
// requested paths in declaration order and the remaining argv. Supports
// `--env-file path`, `--env-file=path`, `-e path` and `-e=path`.
export const extractEnvFiles = (
	argv: readonly string[],
): { paths: string[]; remaining: string[] } => {
	const paths: string[] = [];
	const remaining: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === '--env-file' || a === '-e') {
			const next = argv[i + 1];
			if (next !== undefined) {
				paths.push(next);
				i++;
			}
		} else if (a.startsWith('--env-file=')) {
			paths.push(a.slice('--env-file='.length));
		} else if (a.startsWith('-e=')) {
			paths.push(a.slice('-e='.length));
		} else {
			remaining.push(a);
		}
	}
	return { paths, remaining };
};

// Loads each path into `env` in declaration order. Values that already
// exist in `env` when this function starts (i.e. shell-exported vars)
// are never overwritten, matching Node 22+'s --env-file precedence.
// Later --env-file values override earlier --env-file values for the
// same key (also matching Node's behaviour).
export const applyEnvFiles = (
	paths: readonly string[],
	env: NodeJS.ProcessEnv,
): void => {
	const shellKeys = new Set(Object.keys(env));
	for (const path of paths) {
		const parsed = parseDotenv(readFileSync(path, 'utf8'));
		for (const [key, value] of Object.entries(parsed)) {
			if (!shellKeys.has(key)) {
				env[key] = value;
			}
		}
	}
};

const { paths, remaining } = extractEnvFiles(process.argv.slice(2));
if (paths.length > 0) {
	// Strip the flags so brocli (which doesn't know about --env-file as a
	// shared option) doesn't error on them.
	process.argv = [process.argv[0]!, process.argv[1]!, ...remaining];
	try {
		applyEnvFiles(paths, process.env);
	} catch (err) {
		console.error(
			`drizzle-kit: failed to load --env-file: ${(err as Error).message}`,
		);
		process.exit(1);
	}
}
