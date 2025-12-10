/* eslint-disable unicorn/no-array-callback-reference */
/* eslint-disable drizzle-internal/require-entity-kind */
import { untar } from '@andrewbranch/untar.js';
import { Gunzip } from 'fflate';
import { major, maxSatisfying, minor, valid, validRange } from 'semver';
import ts from 'typescript';
import { type ParsedPackageSpec, parsePackageSpec } from './utils.ts';

export class Package {
	#files: Record<string, string | Uint8Array> = {};
	readonly packageName: string;
	readonly packageVersion: string;
	readonly resolvedUrl?: string;
	readonly typesPackage?: {
		packageName: string;
		packageVersion: string;
		resolvedUrl?: string;
	};

	constructor(
		files: Record<string, string | Uint8Array>,
		packageName: string,
		packageVersion: string,
		resolvedUrl?: string,
		typesPackage?: Package['typesPackage'],
	) {
		this.#files = files;
		this.packageName = packageName;
		this.packageVersion = packageVersion;
		this.resolvedUrl = resolvedUrl;
		this.typesPackage = typesPackage;
	}

	tryReadFile(path: string): string | undefined {
		const file = this.#files[path];
		if (file === undefined) {
			return undefined;
		}
		if (typeof file === 'string') {
			return file;
		}
		const content = new TextDecoder().decode(file);
		this.#files[path] = content;
		return content;
	}

	readFile(path: string): string {
		const content = this.tryReadFile(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}
		return content;
	}

	fileExists(path: string): boolean {
		return path in this.#files;
	}

	directoryExists(path: string): boolean {
		path = ts.ensureTrailingDirectorySeparator(path);
		for (const file in this.#files) {
			if (file.startsWith(path)) {
				return true;
			}
		}
		return false;
	}

	containsTypes(directory = '/'): boolean {
		return this.listFiles(directory).some(ts.hasTSFileExtension);
	}

	listFiles(directory = '/'): string[] {
		directory = ts.ensureTrailingDirectorySeparator(directory);
		return directory === '/'
			? Object.keys(this.#files)
			: Object.keys(this.#files).filter((f) => f.startsWith(directory));
	}

	mergedWithTypes(typesPackage: Package): Package {
		const files = { ...this.#files, ...typesPackage.#files };
		return new Package(files, this.packageName, this.packageVersion, this.resolvedUrl, {
			packageName: typesPackage.packageName,
			packageVersion: typesPackage.packageVersion,
			resolvedUrl: typesPackage.resolvedUrl,
		});
	}
}

export interface CreatePackageFromNpmOptions {
	/**
	 * Controls inclusion of a corresponding `@types` package. Ignored if the implementation
	 * package contains TypeScript files. The value is the version or SemVer range of the
	 * `@types` package to include, `true` to infer the version from the implementation
	 * package version, or `false` to prevent inclusion of a `@types` package.
	 * @default true
	 */
	definitelyTyped?: string | boolean;
	before?: Date;
	allowDeprecated?: boolean;
}

export async function createPackageFromNpm(
	packageSpec: string,
	{ definitelyTyped = true, ...options }: CreatePackageFromNpmOptions = {},
): Promise<Package> {
	const parsed = parsePackageSpec(packageSpec);
	if (parsed.status === 'error') {
		throw new Error(parsed.error);
	}
	const packageName = parsed.data.name;
	const typesPackageName = ts.getTypesPackageName(packageName);
	const { tarballUrl, packageVersion } = parsed.data.versionKind === 'none' && typeof definitelyTyped === 'string'
		? await resolveImplementationPackageForTypesPackage(typesPackageName, definitelyTyped, options)
		: await getNpmTarballUrl([parsed.data], options);
	const pkg = await createPackageFromTarballUrl(tarballUrl);
	if (!definitelyTyped || pkg.containsTypes()) {
		return pkg;
	}

	const typesPackageData = await (definitelyTyped === true
		? resolveTypesPackageForPackage(packageName, packageVersion, options)
		: getNpmTarballUrl(
			[
				{
					name: typesPackageName,
					versionKind: valid(definitelyTyped) ? 'exact' : validRange(definitelyTyped) ? 'range' : 'tag',
					version: definitelyTyped,
				},
			],
			options,
		));

	if (typesPackageData) {
		return pkg.mergedWithTypes(await createPackageFromTarballUrl(typesPackageData.tarballUrl));
	}
	return pkg;
}

export async function resolveImplementationPackageForTypesPackage(
	typesPackageName: string,
	typesPackageVersion: string,
	options?: Omit<CreatePackageFromNpmOptions, 'definitelyTyped'>,
): Promise<ResolvedPackageId> {
	if (!typesPackageName.startsWith('@types/')) {
		throw new Error(`'resolveImplementationPackageForTypesPackage' expects an @types package name and version`);
	}
	const packageName = ts.unmangleScopedPackageName(typesPackageName.slice('@types/'.length));
	const version = valid(typesPackageVersion);
	if (version) {
		return getNpmTarballUrl(
			[
				parsePackageSpec(`${packageName}@${major(version)}.${minor(version)}`).data!,
				parsePackageSpec(`${packageName}@${major(version)}`).data!,
				parsePackageSpec(`${packageName}@latest`).data!,
			],
			options,
		);
	}

	const range = validRange(typesPackageVersion);
	if (range) {
		return getNpmTarballUrl(
			[
				{ name: packageName, versionKind: 'range', version: range },
				{ name: packageName, versionKind: 'tag', version: 'latest' },
			],
			options,
		);
	}

	throw new Error(`'resolveImplementationPackageForTypesPackage' expects a valid SemVer version or range`);
}

export async function resolveTypesPackageForPackage(
	packageName: string,
	packageVersion: string,
	options?: Omit<CreatePackageFromNpmOptions, 'definitelyTyped'>,
): Promise<ResolvedPackageId | undefined> {
	const typesPackageName = ts.getTypesPackageName(packageName);
	try {
		return await getNpmTarballUrl(
			[
				{
					name: typesPackageName,
					versionKind: 'range',
					version: `${major(packageVersion)}.${minor(packageVersion)}`,
				},
				{
					name: typesPackageName,
					versionKind: 'range',
					version: `${major(packageVersion)}`,
				},
				{
					name: typesPackageName,
					versionKind: 'tag',
					version: 'latest',
				},
			],
			options,
		);
	} catch {}

	return undefined;
}

export interface ResolvedPackageId {
	packageName: string;
	packageVersion: string;
	tarballUrl: string;
}

async function getNpmTarballUrl(
	packageSpecs: readonly ParsedPackageSpec[],
	{ before, allowDeprecated }: Omit<CreatePackageFromNpmOptions, 'definitelyTyped'> = {},
): Promise<ResolvedPackageId> {
	const fetchPackument = packageSpecs.some(
		(spec) => spec.versionKind === 'range' || (spec.versionKind === 'tag' && spec.version !== 'latest'),
	);
	const packumentUrl = `https://registry.npmjs.org/${packageSpecs[0]!.name}`;
	const includeTimes = before !== undefined && packageSpecs.some((spec) => spec.versionKind !== 'exact');
	const Accept = includeTimes ? 'application/json' : 'application/vnd.npm.install-v1+json';
	const packument = fetchPackument
		? await fetch(packumentUrl, { headers: { Accept } }).then((r) => r.json())
		: undefined;

	for (const packageSpec of packageSpecs) {
		const manifestUrl = `https://registry.npmjs.org/${packageSpec.name}/${packageSpec.version || 'latest'}`;
		const doc = packument || (await fetch(manifestUrl).then((r) => r.json()));
		if (typeof doc !== 'object' || (doc.error && doc.error !== 'Not found')) {
			throw new Error(`Unexpected response from ${manifestUrl}: ${JSON.stringify(doc)}`);
		}
		const isManifest = !!doc.version;
		let tarballUrl, packageVersion;
		if (packageSpec.versionKind === 'range') {
			packageVersion = doc.versions
				&& maxSatisfying(
					Object.keys(doc.versions).filter(
						(v) =>
							(allowDeprecated || !doc.versions[v].deprecated)
							&& (!before || !doc.time || new Date(doc.time[v]) <= before),
					),
					packageSpec.version,
				);
			if (!packageVersion) {
				continue;
			}
			tarballUrl = doc.versions[packageVersion].dist.tarball;
		} else if (packageSpec.versionKind === 'tag' && packageSpec.version !== 'latest') {
			packageVersion = doc['dist-tags'][packageSpec.version];
			if (!packageVersion) {
				continue;
			}
			if (before && doc.time && new Date(doc.time[packageVersion]) > before) {
				continue;
			}
			tarballUrl = doc.versions[packageVersion].dist.tarball;
		} else if (isManifest) {
			packageVersion = doc.version;
			tarballUrl = doc.dist?.tarball;
		} else {
			packageVersion = doc['dist-tags']?.latest;
			tarballUrl = doc.versions?.[packageVersion].dist.tarball;
		}

		if (packageVersion && tarballUrl) {
			return { packageName: packageSpec.name, packageVersion, tarballUrl };
		}
	}
	throw new Npm404Error(packageSpecs);
}

export class Npm404Error extends Error {
	kind = 'Npm404Error';
	constructor(public packageSpecs: readonly ParsedPackageSpec[]) {
		super(`Failed to find a matching version for ${packageSpecs[0]!.name}`);
	}
}

export async function createPackageFromTarballUrl(tarballUrl: string): Promise<Package> {
	const tarball = await fetchTarball(tarballUrl);
	const { files, packageName, packageVersion } = extractTarball(tarball);
	return new Package(files, packageName, packageVersion, tarballUrl);
}

async function fetchTarball(tarballUrl: string) {
	return new Uint8Array((await fetch(tarballUrl).then((r) => r.arrayBuffer())) satisfies ArrayBuffer);
}

export function createPackageFromTarballData(tarball: Uint8Array): Package {
	const { files, packageName, packageVersion } = extractTarball(tarball);
	return new Package(files, packageName, packageVersion);
}

function extractTarball(tarball: Uint8Array) {
	// Use streaming API to work around https://github.com/101arrowz/fflate/issues/207
	let unzipped: Uint8Array;
	new Gunzip((chunk) => (unzipped = chunk)).push(tarball, /*final*/ true);
	const data = untar(unzipped!.buffer as ArrayBuffer);
	const prefix = data[0]!.filename.slice(0, Math.max(0, data[0]!.filename.indexOf('/') + 1));
	const packageJsonText = data.find((f) => f.filename === `${prefix}package.json`)?.fileData;
	const packageJson = JSON.parse(new TextDecoder().decode(packageJsonText));
	const packageName = packageJson.name;
	const packageVersion = packageJson.version;
	const files = data.reduce((acc: Record<string, Uint8Array>, file) => {
		acc[ts.combinePaths('/node_modules/' + packageName, file.filename.slice(prefix.length))] = file.fileData;
		return acc;
	}, {});
	return { files, packageName, packageVersion };
}
