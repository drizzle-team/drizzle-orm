/* eslint-disable drizzle-internal/require-entity-kind */
import { LRUCache } from 'lru-cache';
import ts from 'typescript';
import type { Package } from '../createPackage.ts';
import type { ModuleKind } from '../types.ts';
import minimalLibDts from './minimalLibDts.ts';

export interface ResolveModuleNameResult {
	resolution: ts.ResolvedModuleWithFailedLookupLocations;
	trace: string[];
}

export interface CompilerHosts {
	node10: CompilerHostWrapper;
	node16: CompilerHostWrapper;
	bundler: CompilerHostWrapper;
	findHostForFiles(files: string[]): CompilerHostWrapper | undefined;
}

export function createCompilerHosts(fs: Package): CompilerHosts {
	const node10 = new CompilerHostWrapper(fs, ts.ModuleResolutionKind.Node10, ts.ModuleKind.CommonJS);
	const node16 = new CompilerHostWrapper(fs, ts.ModuleResolutionKind.Node16, ts.ModuleKind.Node16);
	const bundler = new CompilerHostWrapper(fs, ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext);

	return {
		node10,
		node16,
		bundler,
		findHostForFiles(files: string[]) {
			for (const host of [node10, node16, bundler]) {
				if (files.every((f) => host.getSourceFileFromCache(f) !== undefined)) {
					return host;
				}
			}

			return;
		},
	};
}

const getCanonicalFileName = ts.createGetCanonicalFileName(false);
const toPath = (fileName: string) => ts.toPath(fileName, '/', getCanonicalFileName);

export class CompilerHostWrapper {
	private programCache = new LRUCache<string, ts.Program>({ max: 2 });
	private compilerHost: ts.CompilerHost;
	private compilerOptions: ts.CompilerOptions;
	private normalModuleResolutionCache: ts.ModuleResolutionCache;
	private noDtsResolutionModuleResolutionCache: ts.ModuleResolutionCache;

	private moduleResolutionCache: Record<
		/*FromFileName*/ string,
		Record</*Key*/ string, { resolution: ts.ResolvedModuleWithFailedLookupLocations; trace: string[] }>
	> = {};
	private traceCollector: TraceCollector = new TraceCollector();
	private sourceFileCache: Map<ts.Path, ts.SourceFile> = new Map();
	private resolvedModules: Exclude<ts.Program['resolvedModules'], undefined> = new Map();
	private languageVersion = ts.ScriptTarget.Latest;

	constructor(fs: Package, moduleResolution: ts.ModuleResolutionKind, moduleKind: ts.ModuleKind) {
		this.compilerOptions = {
			moduleResolution,
			module: moduleKind,
			// So `sourceFile.externalModuleIndicator` is set to a node
			moduleDetection: ts.ModuleDetectionKind.Legacy,
			target: ts.ScriptTarget.Latest,
			resolveJsonModule: true,
			traceResolution: true,
		};
		this.normalModuleResolutionCache = ts.createModuleResolutionCache('/', getCanonicalFileName, this.compilerOptions);
		this.noDtsResolutionModuleResolutionCache = ts.createModuleResolutionCache(
			'/',
			getCanonicalFileName,
			this.compilerOptions,
		);
		this.compilerHost = this.createCompilerHost(fs, this.sourceFileCache);
	}

	getCompilerOptions() {
		return this.compilerOptions;
	}

	getSourceFile(fileName: string): ts.SourceFile | undefined {
		return this.compilerHost.getSourceFile(fileName, this.languageVersion);
	}

	getSourceFileFromCache(fileName: string): ts.SourceFile | undefined {
		return this.sourceFileCache.get(toPath(fileName));
	}

	getModuleKindForFile(fileName: string): ModuleKind | undefined {
		const kind = this.getImpliedNodeFormatForFile(fileName);
		if (kind) {
			const extension = ts.getAnyExtensionFromPath(fileName);
			const isExtension = extension === ts.Extension.Cjs
				|| extension === ts.Extension.Cts
				|| extension === ts.Extension.Dcts
				|| extension === ts.Extension.Mjs
				|| extension === ts.Extension.Mts
				|| extension === ts.Extension.Dmts;
			const reasonPackageJsonInfo = isExtension ? undefined : this.getPackageScopeForPath(fileName);
			const reasonFileName = isExtension
				? fileName
				: reasonPackageJsonInfo
				? reasonPackageJsonInfo.packageDirectory + '/package.json'
				: fileName;
			const reasonPackageJsonType = reasonPackageJsonInfo?.contents?.packageJsonContent.type;
			return {
				detectedKind: kind,
				detectedReason: isExtension ? 'extension' : reasonPackageJsonType ? 'type' : 'no:type',
				reasonFileName,
			};
		}

		return undefined;
	}

	resolveModuleName(
		moduleName: string,
		containingFile: string,
		resolutionMode?: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS,
		noDtsResolution?: boolean,
		allowJs?: boolean,
	): ResolveModuleNameResult {
		const moduleKey = this.getModuleKey(moduleName, resolutionMode, noDtsResolution, allowJs);
		if (this.moduleResolutionCache[containingFile]?.[moduleKey]) {
			const { resolution, trace } = this.moduleResolutionCache[containingFile][moduleKey];
			return {
				resolution,
				trace,
			};
		}
		this.traceCollector.clear();
		const resolution = ts.resolveModuleName(
			moduleName,
			containingFile,
			noDtsResolution ? { ...this.compilerOptions, noDtsResolution, allowJs } : this.compilerOptions,
			this.compilerHost,
			noDtsResolution ? this.noDtsResolutionModuleResolutionCache : this.normalModuleResolutionCache,
			/*redirectedReference*/ undefined,
			resolutionMode,
		);
		const trace = this.traceCollector.read();
		if (!this.moduleResolutionCache[containingFile]?.[moduleKey]) {
			(this.moduleResolutionCache[containingFile] ??= {})[moduleKey] = { resolution, trace };
		}
		return {
			resolution,
			trace,
		};
	}

	getTrace(
		fromFileName: string,
		moduleSpecifier: string,
		resolutionMode: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined,
	): string[] | undefined {
		return this.moduleResolutionCache[fromFileName]?.[
			this.getModuleKey(moduleSpecifier, resolutionMode, /*noDtsResolution*/ undefined, /*allowJs*/ undefined)
		]?.trace;
	}

	private getModuleKey(
		moduleSpecifier: string,
		resolutionMode: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined,
		noDtsResolution: boolean | undefined,
		allowJs: boolean | undefined,
	) {
		return `${resolutionMode ?? 1}:${+!!noDtsResolution}:${+!!allowJs}:${moduleSpecifier}`;
	}

	private getProgram(rootNames: readonly string[], options: ts.CompilerOptions) {
		const key = programKey(rootNames, options);
		let program = this.programCache.get(key);
		if (!program) {
			this.programCache.set(key, program = ts.createProgram({ rootNames, options, host: this.compilerHost }));
		}
		return program;
	}

	createPrimaryProgram(rootName: string) {
		const program = this.getProgram([rootName], this.compilerOptions);

		if (program.resolvedModules) {
			for (const [path, cache] of program.resolvedModules.entries()) {
				let ownCache = this.resolvedModules.get(path);
				if (!ownCache) {
					this.resolvedModules.set(path, ownCache = ts.createModeAwareCache());
				}
				// eslint-disable-next-line unicorn/no-array-for-each
				cache.forEach((resolution, key, mode) => {
					ownCache!.set(key, mode, resolution);
				});
			}
		}

		return program;
	}

	createAuxiliaryProgram(rootNames: string[], extraOptions?: ts.CompilerOptions): ts.Program {
		if (
			extraOptions
			&& ts.changesAffectModuleResolution(
				// allowJs and noDtsResolution are part of the cache key, but any other resolution-affecting options
				// are assumed to be constant for the host.
				{
					...this.compilerOptions,
					allowJs: extraOptions.allowJs,
					checkJs: extraOptions.checkJs,
					noDtsResolution: extraOptions.noDtsResolution,
				},
				{ ...this.compilerOptions, ...extraOptions },
			)
		) {
			throw new Error('Cannot override resolution-affecting options for host due to potential cache pollution');
		}
		const options = extraOptions ? { ...this.compilerOptions, ...extraOptions } : this.compilerOptions;
		return this.getProgram(rootNames, options);
	}

	getResolvedModule(sourceFile: ts.SourceFile, moduleName: string, resolutionMode: ts.ResolutionMode) {
		return this.resolvedModules.get(sourceFile.path)?.get(moduleName, resolutionMode);
	}

	private createCompilerHost(fs: Package, sourceFileCache: Map<ts.Path, ts.SourceFile>): ts.CompilerHost {
		return {
			fileExists: fs.fileExists.bind(fs),
			readFile: fs.readFile.bind(fs),
			directoryExists: fs.directoryExists.bind(fs),
			getSourceFile: (fileName) => {
				const path = toPath(fileName);
				const cached = sourceFileCache.get(path);
				if (cached) {
					return cached;
				}
				const content = fileName === '/node_modules/typescript/lib/lib.d.ts' ? minimalLibDts : fs.tryReadFile(fileName);
				if (content === undefined) {
					return;
				}

				const sourceFile = ts.createSourceFile(
					fileName,
					content,
					{
						languageVersion: this.languageVersion,
						impliedNodeFormat: this.getImpliedNodeFormatForFile(fileName),
					},
					/*setParentNodes*/ true,
				);
				sourceFileCache.set(path, sourceFile);
				return sourceFile;
			},
			getDefaultLibFileName: () => '/node_modules/typescript/lib/lib.d.ts',
			getCurrentDirectory: () => '/',
			writeFile: () => {
				throw new Error('Not implemented');
			},
			getCanonicalFileName,
			useCaseSensitiveFileNames: () => false,
			getNewLine: () => '\n',
			trace: this.traceCollector.trace,
			resolveModuleNameLiterals: (
				moduleLiterals,
				containingFile,
				_redirectedReference,
				options,
				containingSourceFile,
			) => {
				return moduleLiterals.map(
					(literal) =>
						this.resolveModuleName(
							literal.text,
							containingFile,
							ts.getModeForUsageLocation(containingSourceFile, literal, this.compilerOptions),
							options.noDtsResolution,
						).resolution,
				);
			},
		};
	}

	private getImpliedNodeFormatForFile(fileName: string): ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined {
		return ts.getImpliedNodeFormatForFile(
			toPath(fileName),
			this.normalModuleResolutionCache.getPackageJsonInfoCache(),
			this.compilerHost,
			this.compilerOptions,
		);
	}

	private getPackageScopeForPath(fileName: string): ts.PackageJsonInfo | undefined {
		return ts.getPackageScopeForPath(
			fileName,
			ts.getTemporaryModuleResolutionState(
				// TODO: consider always using the node16 cache because package.json should be a hit
				this.normalModuleResolutionCache.getPackageJsonInfoCache(),
				this.compilerHost,
				this.compilerOptions,
			),
		);
	}
}

class TraceCollector {
	private traces: string[] = [];

	trace = (message: string) => {
		this.traces.push(message);
	};
	read() {
		const result = [...this.traces];
		this.clear();
		return result;
	}
	clear() {
		this.traces.length = 0;
	}
}

function programKey(rootNames: readonly string[], options: ts.CompilerOptions) {
	return JSON.stringify([rootNames, Object.entries(options).sort(([k1], [k2]) => k1.localeCompare(k2))]);
}
