import chalk from 'chalk';
import { exec } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import fetch from 'node-fetch';
import semver from 'semver';

export interface UpdateOptions {
	beta: boolean;
	kitBeta: boolean;
	ormBeta: boolean;
	dryRun: boolean;
	skipInstall: boolean;
}

interface NpmPackageInfo {
	'dist-tags': {
		latest: string;
		beta?: string;
		next?: string;
		rc?: string;
	};
	versions: Record<string, unknown>;
}

interface UpdateResult {
	package: string;
	from: string | null;
	to: string;
	location: 'dependencies' | 'devDependencies';
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export async function fetchPackageInfo(packageName: string): Promise<NpmPackageInfo> {
	const response = await fetch(`https://registry.npmjs.org/${packageName}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch package info for ${packageName}: ${response.statusText}`);
	}
	return response.json() as Promise<NpmPackageInfo>;
}

export function getLatestVersion(packageInfo: NpmPackageInfo, useBeta: boolean): string {
	if (useBeta) {
		const betaVersion = packageInfo['dist-tags'].beta
			|| packageInfo['dist-tags'].next
			|| packageInfo['dist-tags'].rc;
		if (betaVersion) {
			return betaVersion;
		}
	}
	return packageInfo['dist-tags'].latest;
}

export function detectPackageManager(): PackageManager {
	if (existsSync('pnpm-lock.yaml')) return 'pnpm';
	if (existsSync('yarn.lock')) return 'yarn';
	if (existsSync('bun.lockb')) return 'bun';
	return 'npm';
}

export function getInstallCommand(pm: PackageManager): string {
	switch (pm) {
		case 'pnpm':
			return 'pnpm install';
		case 'yarn':
			return 'yarn install';
		case 'bun':
			return 'bun install';
		default:
			return 'npm install';
	}
}

export function updatePackageInJson(
	packageJson: Record<string, unknown>,
	packageName: string,
	newVersion: string,
): UpdateResult | null {
	for (const location of ['dependencies', 'devDependencies'] as const) {
		const deps = packageJson[location] as Record<string, string> | undefined;
		if (deps?.[packageName]) {
			const currentVersion = deps[packageName];
			const cleanCurrent = currentVersion.replace(/^[\^~]/, '');

			if (!semver.valid(cleanCurrent)) {
				return null;
			}

			if (semver.lt(cleanCurrent, newVersion)) {
				const prefix = currentVersion.startsWith('^')
					? '^'
					: currentVersion.startsWith('~')
					? '~'
					: '';
				deps[packageName] = `${prefix}${newVersion}`;
				return {
					package: packageName,
					from: currentVersion,
					to: `${prefix}${newVersion}`,
					location,
				};
			}
			return null;
		}
	}
	return null;
}

function runCommand(command: string): Promise<void> {
	return new Promise((resolve, reject) => {
		exec(command, (error, _stdout, _stderr) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
}

export async function updateHandler(options: UpdateOptions): Promise<void> {
	console.log(chalk.cyan('Checking for updates...'));
	console.log();

	const packageJsonPath = 'package.json';

	if (!existsSync(packageJsonPath)) {
		console.log(chalk.red('Error: No package.json found in current directory.'));
		process.exit(1);
	}

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
		const results: UpdateResult[] = [];

		const [ormInfo, kitInfo] = await Promise.all([
			fetchPackageInfo('drizzle-orm'),
			fetchPackageInfo('drizzle-kit'),
		]);

		const ormVersion = getLatestVersion(ormInfo, options.beta || options.ormBeta);
		const kitVersion = getLatestVersion(kitInfo, options.beta || options.kitBeta);

		const ormResult = updatePackageInJson(packageJson, 'drizzle-orm', ormVersion);
		if (ormResult) results.push(ormResult);

		const kitResult = updatePackageInJson(packageJson, 'drizzle-kit', kitVersion);
		if (kitResult) results.push(kitResult);

		if (results.length === 0) {
			console.log(chalk.green('All Drizzle packages are already up to date!'));
			return;
		}

		if (options.dryRun) {
			console.log(chalk.yellow('Dry run - no changes made. Would update:'));
		} else {
			writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
			console.log(chalk.green('Updated packages:'));
		}

		for (const result of results) {
			const arrow = chalk.gray('->');
			const from = result.from ? chalk.red(result.from) : chalk.gray('(not installed)');
			const to = chalk.green(result.to);
			console.log(`  ${chalk.bold(result.package)}: ${from} ${arrow} ${to}`);
		}

		if (!options.dryRun && !options.skipInstall) {
			console.log();
			const pm = detectPackageManager();
			const installCmd = getInstallCommand(pm);
			console.log(chalk.gray(`Running ${installCmd}...`));

			await runCommand(installCmd);
			console.log(chalk.green('Dependencies installed successfully!'));
		} else if (!options.dryRun && options.skipInstall) {
			console.log();
			console.log(chalk.yellow('Skipped install. Run your package manager to install updates.'));
		}
	} catch (err) {
		console.log(chalk.red(`Error updating packages: ${err}`));
		process.exit(1);
	}
}
