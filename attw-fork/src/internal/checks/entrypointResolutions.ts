import ts from 'typescript';
import type { Problem } from '../../types.ts';
import { resolvedThroughFallback } from '../../utils.ts';
import { defineCheck } from '../defineCheck.ts';

export default defineCheck({
	name: 'EntrypointResolutions',
	dependencies: ({ subpath, resolutionKind }) => [subpath, resolutionKind],
	execute: ([subpath, resolutionKind], context) => {
		const problems: Problem[] = [];
		const entrypoint = context.entrypoints[subpath]!.resolutions[resolutionKind];
		if (entrypoint.isWildcard) {
			return;
		}

		if (!entrypoint.resolution) {
			problems.push({
				kind: 'NoResolution',
				entrypoint: subpath,
				resolutionKind,
			});
		} else if (!entrypoint.resolution.isTypeScript && !entrypoint.resolution.isJson) {
			problems.push({
				kind: 'UntypedResolution',
				entrypoint: subpath,
				resolutionKind,
			});
		}

		if (
			resolutionKind === 'node16-cjs'
			&& ((!entrypoint.implementationResolution
				&& entrypoint.resolution
				&& context.programInfo['node16'].moduleKinds![entrypoint.resolution.fileName]?.detectedKind
					=== ts.ModuleKind.ESNext)
				|| (entrypoint.implementationResolution
					&& context.programInfo['node16'].moduleKinds![entrypoint.implementationResolution.fileName]?.detectedKind
						=== ts.ModuleKind.ESNext))
		) {
			problems.push({
				kind: 'CJSResolvesToESM',
				entrypoint: subpath,
				resolutionKind,
			});
		}

		if (entrypoint.resolution && resolvedThroughFallback(entrypoint.resolution.trace)) {
			problems.push({
				kind: 'FallbackCondition',
				entrypoint: subpath,
				resolutionKind,
			});
		}

		return problems;
	},
});
