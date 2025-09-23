import ts from 'typescript';
import type { InternalResolutionErrorProblem } from '../../types.ts';
import { defineCheck } from '../defineCheck.ts';

export default defineCheck({
	name: 'InternalResolutionError',
	enumerateFiles: true,
	dependencies: ({ resolutionOption, fileName }) => [resolutionOption, fileName],
	execute: ([resolutionOption, fileName], context) => {
		if (!ts.hasTSFileExtension(fileName)) {
			return;
		}
		const host = context.hosts[resolutionOption];
		const sourceFile = host.getSourceFile(fileName);
		if (sourceFile?.imports) {
			const problems: InternalResolutionErrorProblem[] = [];
			for (const moduleSpecifier of sourceFile.imports) {
				const reference = moduleSpecifier.text;
				if (
					reference !== context.pkg.packageName
					&& !reference.startsWith(`${context.pkg.packageName}/`)
					&& reference[0] !== '#'
					&& !ts.pathIsRelative(reference)
				) {
					// Probably a reference to something we'd have to npm install.
					// These can definitely be errors, but I'm not installing a whole
					// graph for now.
					continue;
				}
				const resolutionMode = ts.getModeForUsageLocation(sourceFile, moduleSpecifier, host.getCompilerOptions());
				const resolution = host.getResolvedModule(sourceFile, moduleSpecifier.text, resolutionMode);
				if (!resolution) {
					throw new Error(`Expected resolution for '${moduleSpecifier.text}' in ${fileName}`);
				}

				if (!resolution.resolvedModule) {
					problems.push({
						kind: 'InternalResolutionError',
						resolutionOption,
						fileName,
						moduleSpecifier: reference,
						pos: moduleSpecifier.pos,
						end: moduleSpecifier.end,
						resolutionMode,
						trace: host.getTrace(fileName, moduleSpecifier.text, resolutionMode)!,
					});
				}
			}
			return problems;
		}
		return;
	},
});
