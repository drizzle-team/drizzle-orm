import fs from 'fs';
import m from 'micromatch';
import { dirname, join as joinPath, relative, resolve as resolvePath } from 'path';
import { analyze } from './analyze';

type External = {
	file: string;
	import: string;
	type: 'data' | 'types';
};

export type Issue = {
	file: string;
	imports: IssueImport[];
	accessChains: ChainLink[][];
};

export type IssueImport = {
	name: string;
	type: 'data' | 'types';
};

export type ChainLink = {
	file: string;
	import: string;
};

type ListMode = 'whitelist' | 'blacklist';

class ImportAnalyzer {
	private localImportRegex = /^(\.?\.?\/|\.\.?$)/;
	private importedFileFormatRegex = /^.*\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/i;

	private visited: Set<string> = new Set<string>();

	private externals: External[] = [];
	private accessChains: Record<string, ChainLink[][]> = {};

	constructor(
		private basePath: string,
		private entry: string,
		private listMode: ListMode,
		private readonly wantedList: string[],
		private localPaths: string[],
		private logger?: boolean,
		private ignoreTypes?: boolean,
	) {}

	private isDirectory = (path: string) => {
		try {
			return fs.lstatSync(path).isDirectory();
		} catch (e) {
			return false;
		}
	};

	private isFile = (path: string) => {
		try {
			return fs.lstatSync(path).isFile();
		} catch (e) {
			return false;
		}
	};

	private localizePath = (path: string) => relative(resolvePath(this.basePath), resolvePath(path));

	private isCustomLocal = (importTarget: string) =>
		!!this.localPaths.find(
			(l) =>
				importTarget === l
				|| importTarget.startsWith(l.endsWith('/') ? l : `${l}/`),
		);
	private isLocal = (importTarget: string) =>
		this.localImportRegex.test(importTarget)
		|| this.isCustomLocal(importTarget);
	private isTsFormat = (path: string) => this.importedFileFormatRegex.test(path);

	private resolveCustomLocalPath = (
		absoluteBase: string,
		base: string,
		target: string,
	): string => {
		return joinPath(absoluteBase, target);
	};

	private resolveTargetFile = (path: string): string => {
		if (this.isFile(path)) return path;

		const formats = [
			'.ts',
			'.mts',
			'.cts',
			'.tsx',
			'.js',
			'.mjs',
			'.cjs',
			'.jsx',
		];

		for (const format of formats) {
			const indexPath = joinPath(path, `/index${format}`);
			if (this.isFile(indexPath)) return indexPath;

			const formatFilePath = `${path}${format}`;
			if (this.isFile(formatFilePath)) return formatFilePath;
		}

		return path;
	};

	private resolveTargetPath = (
		absoluteBase: string,
		base: string,
		target: string,
	): string => {
		if (this.isCustomLocal(target)) {
			return this.resolveTargetFile(
				this.resolveCustomLocalPath(absoluteBase, base, target),
			);
		}

		const dir = this.isDirectory(base) ? base : dirname(base);
		const joined = joinPath(dir, target);

		return this.resolveTargetFile(joined);
	};

	private _analyzeImports = (
		target: string = this.entry,
		basePath: string = this.basePath,
		accessChain: ChainLink[] = [],
	) => {
		if (this.visited.has(target)) return;

		const locals: string[] = [];

		try {
			if (this.logger) console.log(`${this.localizePath(target)}`);

			const imports = analyze(target);

			for (const { source: i, type } of imports) {
				if (this.ignoreTypes && type === 'types') continue;

				if (this.isLocal(i)) {
					locals.push(i);

					continue;
				}

				this.externals.push({
					file: this.localizePath(target),
					import: i,
					type: type,
				});
			}
		} catch (e) {
			throw e;
		} finally {
			this.visited.add(target);
		}

		for (const local of locals) {
			const transformedTarget = this.resolveTargetPath(basePath, target, local);

			const localChain = [
				...accessChain,
				{
					file: this.localizePath(target),
					import: local,
				},
			];

			const localized = this.localizePath(transformedTarget);

			if (this.accessChains[localized]) {
				this.accessChains[localized].push(localChain);
			} else this.accessChains[localized] = [localChain];

			if (this.isTsFormat(transformedTarget)) {
				this._analyzeImports(transformedTarget, basePath, localChain);
			} else {
				throw new Error(`unrecognized: ${localized}`);
			}
		}
	};

	public analyzeImports = () => {
		const entryLocalized = this.localizePath(this.entry);
		if (!this.accessChains[entryLocalized]) {
			this.accessChains[entryLocalized] = [[]];
		}

		this._analyzeImports();

		const rawIssues = this.listMode === 'whitelist'
			? this.externals.filter((e) => !m([e.import], this.wantedList).length)
			: this.externals.filter((e) => m([e.import], this.wantedList).length);

		const issueMap: Record<string, Issue> = {};
		for (const { file, import: i, type } of rawIssues) {
			if (issueMap[file]) {
				issueMap[file].imports.push({
					name: i,
					type,
				});

				continue;
			}

			issueMap[file] = {
				file,
				imports: [
					{
						name: i,
						type,
					},
				],
				accessChains: this.accessChains[file]!,
			};
		}

		return {
			issues: Object.entries(issueMap).map(([file, data]) => {
				for (const chain of data.accessChains) {
					chain.push({
						file,
						import: '',
					});
				}

				return data;
			}),
			accessChains: this.accessChains,
		};
	};
}

export type CustomLocalPathResolver = (
	basePath: string,
	path: string,
	target: string,
) => string;

export type AnalyzeImportsConfig =
	& {
		basePath: string;
		entry: string;
		logger?: boolean;
		ignoreTypes?: boolean;
		localPaths?: string[];
	}
	& (
		| {
			blackList: string[];
		}
		| {
			whiteList: string[];
		}
	);

type AnyAnalyzeImportsConfig = {
	basePath: string;
	entry: string;
	blackList?: string[];
	whiteList?: string[];
	logger?: boolean;
	ignoreTypes?: boolean;
	localPaths?: string[];
};

export function analyzeImports(cfg: AnalyzeImportsConfig) {
	const {
		basePath,
		blackList,
		whiteList,
		entry,
		localPaths: localImports,
		ignoreTypes,
		logger,
	} = cfg as AnyAnalyzeImportsConfig;
	const mode = whiteList ? 'whitelist' : 'blacklist';
	const wantedList = blackList ?? whiteList!;

	const analyzer = new ImportAnalyzer(
		joinPath(basePath),
		joinPath(entry),
		mode,
		wantedList,
		localImports ?? [],
		logger,
		ignoreTypes,
	);

	return analyzer.analyzeImports();
}
