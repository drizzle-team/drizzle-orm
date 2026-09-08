import { valid, validRange } from 'semver';
import validatePackgeName from 'validate-npm-package-name';
import type {
	BuildTool,
	EntrypointInfo,
	EntrypointResolutionAnalysis,
	Failable,
	ParsedPackageSpec,
	Problem,
	ProblemKind,
	ResolutionKind,
	ResolutionOption,
} from './types.ts';

export const allResolutionOptions: ResolutionOption[] = ['node10', 'node16', 'bundler'];
export const allResolutionKinds: ResolutionKind[] = ['node10', 'node16-cjs', 'node16-esm', 'bundler'];

export function getResolutionOption(resolutionKind: ResolutionKind): ResolutionOption {
	switch (resolutionKind) {
		case 'node10': {
			return 'node10';
		}
		case 'node16-cjs':
		case 'node16-esm': {
			return 'node16';
		}
		case 'bundler': {
			return 'bundler';
		}
	}
}

export function getResolutionKinds(resolutionOption: ResolutionOption): ResolutionKind[] {
	switch (resolutionOption) {
		case 'node10': {
			return ['node10'];
		}
		case 'node16': {
			return ['node16-cjs', 'node16-esm'];
		}
		case 'bundler': {
			return ['bundler'];
		}
	}
}

export function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

export function resolvedThroughFallback(traces: string[]) {
	let i = 0;
	while (i < traces.length) {
		i = traces.indexOf('Entering conditional exports.', i);
		if (i === -1) {
			return false;
		}
		if (conditionalExportsResolvedThroughFallback()) {
			return true;
		}
	}

	function conditionalExportsResolvedThroughFallback(): boolean {
		i++;
		let seenFailure = false;
		for (; i < traces.length; i++) {
			if (traces[i]!.startsWith("Failed to resolve under condition '")) {
				seenFailure = true;
			} else if (seenFailure && traces[i]!.startsWith("Resolved under condition '")) {
				return true;
			} else if (traces[i] === 'Entering conditional exports.') {
				if (conditionalExportsResolvedThroughFallback()) {
					return true;
				}
			} else if (traces[i] === 'Exiting conditional exports.') {
				return false;
			}
		}
		return false;
	}

	return;
}

export function visitResolutions(
	entrypoints: Record<string, EntrypointInfo>,
	visitor: (analysis: EntrypointResolutionAnalysis, info: EntrypointInfo) => unknown,
) {
	for (const entrypoint of Object.values(entrypoints)) {
		for (const resolution of Object.values(entrypoint.resolutions)) {
			if (visitor(resolution, entrypoint)) {
				return;
			}
		}
	}
}

export function groupProblemsByKind<K extends ProblemKind>(
	problems: (Problem & { kind: K })[],
): Partial<Record<K, (Problem & { kind: K })[]>> {
	const result: Partial<Record<K, (Problem & { kind: K })[]>> = {};
	for (const problem of problems) {
		(result[problem.kind] ??= []).push(problem);
	}
	return result;
}

export function parsePackageSpec(input: string): Failable<ParsedPackageSpec> {
	let name;
	let version;
	let i = 0;
	if (input.startsWith('@')) {
		i = input.indexOf('/');
		if (i === -1 || i === 1) {
			return {
				status: 'error',
				error: 'Invalid package name',
			};
		}
		i++;
	}
	i = input.indexOf('@', i);
	if (i === -1) {
		name = input;
	} else {
		name = input.slice(0, i);
		version = input.slice(i + 1);
	}

	if (validatePackgeName(name).errors) {
		return {
			status: 'error',
			error: 'Invalid package name',
		};
	}
	if (!version) {
		return {
			status: 'success',
			data: { versionKind: 'none', name, version: '' },
		};
	}
	if (valid(version)) {
		return {
			status: 'success',
			data: { versionKind: 'exact', name, version },
		};
	}
	if (validRange(version)) {
		return {
			status: 'success',
			data: { versionKind: 'range', name, version },
		};
	}
	return {
		status: 'success',
		data: { versionKind: 'tag', name, version },
	};
}

export const allBuildTools = Object.keys(
	{
		'@arethetypeswrong/cli': true,
		typescript: true,
		rollup: true,
		'@rollup/plugin-typescript': true,
		'@rollup/plugin-typescript2': true,
		webpack: true,
		esbuild: true,
		'parcel-bundler': true,
		'@preconstruct/cli': true,
		vite: true,
		snowpack: true,
		microbundle: true,
		'@microsoft/api-extractor': true,
		tshy: true,
		'@rspack/cli': true,
		tsup: true,
		tsdown: true,
	} satisfies Record<BuildTool, any>,
) as BuildTool[];

export { type ParsedPackageSpec } from './types.ts';
