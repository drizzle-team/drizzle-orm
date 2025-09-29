import ts from 'typescript';
import { defineCheck } from '../defineCheck.ts';

export default defineCheck({
	name: 'UnexpectedModuleSyntax',
	enumerateFiles: true,
	dependencies: ({ fileName, resolutionOption, programInfo }) => {
		return [fileName, programInfo[resolutionOption].moduleKinds?.[fileName]];
	},
	execute: ([fileName, expectedModuleKind], context) => {
		if (!expectedModuleKind || !ts.hasJSFileExtension(fileName)) {
			return;
		}
		const host = context.hosts.findHostForFiles([fileName]) ?? context.hosts.bundler;
		const sourceFile = host.getSourceFile(fileName)!;
		const syntaxImpliedModuleKind = sourceFile.externalModuleIndicator
			? ts.ModuleKind.ESNext
			: sourceFile.commonJsModuleIndicator
			? ts.ModuleKind.CommonJS
			: undefined;
		if (syntaxImpliedModuleKind !== undefined && expectedModuleKind.detectedKind !== syntaxImpliedModuleKind) {
			// Value cannot be `true` because we set `moduleDetection: "legacy"`
			const syntax = (sourceFile.externalModuleIndicator ?? sourceFile.commonJsModuleIndicator) as ts.Node;
			return {
				kind: 'UnexpectedModuleSyntax',
				fileName,
				moduleKind: expectedModuleKind,
				syntax: syntaxImpliedModuleKind,
				pos: syntax.getStart(sourceFile),
				end: syntax.end,
			};
		}
		return;
	},
});
