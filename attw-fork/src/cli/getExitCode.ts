import type { CheckResult } from '../types.ts';
import { problemFlags } from './problemUtils.ts';
import type { RenderOptions } from './renderOptions.ts';

export function getExitCode(analysis: CheckResult, opts?: RenderOptions): number {
	if (!analysis.types) {
		return 0;
	}
	const ignoreRules = opts?.ignoreRules ?? [];
	const ignoreResolutions = opts?.ignoreResolutions ?? [];
	return analysis.problems.some((problem) => {
			const notRuleIgnored = !ignoreRules.includes(problemFlags[problem.kind]);
			const notResolutionIgnored = 'resolutionKind' in problem
				? !ignoreResolutions.includes(problem.resolutionKind)
				: true;
			return notRuleIgnored && notResolutionIgnored;
		})
		? 1
		: 0;
}
