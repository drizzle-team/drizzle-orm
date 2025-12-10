import { init as initCjsLexer } from 'cjs-module-lexer';
import type { Package } from './createPackage.ts';
import checks from './internal/checks/index.ts';
import type { AnyCheck, CheckDependenciesContext } from './internal/defineCheck.ts';
import { getBuildTools, getEntrypointInfo, getModuleKinds } from './internal/getEntrypointInfo.ts';
import { createCompilerHosts } from './internal/multiCompilerHost.ts';
import type {
	AnalysisTypes,
	CheckResult,
	EntrypointResolutionAnalysis,
	Problem,
	ProgramInfo,
	ResolutionOption,
} from './types.ts';
import { getResolutionOption, visitResolutions } from './utils.ts';

export interface CheckPackageOptions {
	/**
	 * Exhaustive list of entrypoints to check. The package root is `"."`.
	 * Specifying this option disables automatic entrypoint discovery,
	 * and overrides the `includeEntrypoints` and `excludeEntrypoints` options.
	 */
	entrypoints?: string[];
	/**
	 * Entrypoints to check in addition to automatically discovered ones.
	 */
	includeEntrypoints?: string[];
	/**
	 * Entrypoints to exclude from checking.
	 */
	excludeEntrypoints?: (string | RegExp)[];

	/**
	 * Whether to automatically consider all published files as entrypoints
	 * in the absence of any other detected or configured entrypoints.
	 */
	entrypointsLegacy?: boolean;

	/**
	 * Resolution modes that package's files will be loaded in.
	 * Unwanted mode must be set to `false` to exclude.
	 */
	modes?: {
		bundler?: boolean;
		node10?: boolean;
		'node16-cjs'?: boolean;
		'node16-esm'?: boolean;
	};
}

export async function checkPackage(pkg: Package, options?: CheckPackageOptions): Promise<CheckResult> {
	const types: AnalysisTypes | false = pkg.typesPackage
		? {
			kind: '@types',
			...pkg.typesPackage,
			definitelyTypedUrl: JSON.parse(pkg.readFile(`/node_modules/${pkg.typesPackage.packageName}/package.json`))
				.homepage,
		}
		: pkg.containsTypes()
		? { kind: 'included' }
		: false;
	const { packageName, packageVersion } = pkg;
	if (!types) {
		return { packageName, packageVersion, types };
	}

	const hosts = createCompilerHosts(pkg);
	const entrypointResolutions = getEntrypointInfo(packageName, pkg, hosts, options);
	const programInfo: Record<ResolutionOption, ProgramInfo> = {
		node10: {},
		node16: { moduleKinds: getModuleKinds(entrypointResolutions, 'node16', hosts) },
		bundler: {},
	};

	await initCjsLexer();
	const problems: Problem[] = [];
	const problemIdsToIndices = new Map<string, number[]>();
	visitResolutions(entrypointResolutions, (analysis, info) => {
		for (const check of checks) {
			const context = {
				pkg,
				hosts,
				entrypoints: entrypointResolutions,
				programInfo,
				subpath: info.subpath,
				resolutionKind: analysis.resolutionKind,
				resolutionOption: getResolutionOption(analysis.resolutionKind),
				fileName: undefined,
			};
			if (check.enumerateFiles) {
				for (const fileName of analysis.files ?? []) {
					runCheck(check, { ...context, fileName }, analysis);
				}
				if (analysis.implementationResolution) {
					runCheck(check, { ...context, fileName: analysis.implementationResolution.fileName }, analysis);
				}
			} else {
				runCheck(check, context, analysis);
			}
		}
	});

	return {
		packageName,
		packageVersion,
		types,
		buildTools: getBuildTools(JSON.parse(pkg.readFile(`/node_modules/${packageName}/package.json`))),
		entrypoints: entrypointResolutions,
		programInfo,
		problems,
	};

	function runCheck(
		check: AnyCheck,
		context: CheckDependenciesContext<boolean>,
		analysis: EntrypointResolutionAnalysis,
	) {
		const dependencies = check.dependencies(context);
		const id = check.name
			+ JSON.stringify(dependencies, (_, value) => {
				if (typeof value === 'function') {
					throw new Error('Encountered unexpected function in check dependencies');
				}
				return value;
			});
		let indices = problemIdsToIndices.get(id);
		if (indices) {
			(analysis.visibleProblems ??= []).push(...indices);
		} else {
			indices = [];
			const checkProblems = check.execute(dependencies, context);
			for (const problem of Array.isArray(checkProblems) ? checkProblems : checkProblems ? [checkProblems] : []) {
				indices.push(problems.length);
				problems.push(problem);
			}
			problemIdsToIndices.set(id, indices);
			(analysis.visibleProblems ??= []).push(...indices);
		}
	}
}
