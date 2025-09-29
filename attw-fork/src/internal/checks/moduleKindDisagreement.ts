import ts from 'typescript';
import { defineCheck } from '../defineCheck.ts';

export default defineCheck({
	name: 'ModuleKindDisagreement',
	dependencies: ({ entrypoints, subpath, resolutionKind, resolutionOption, programInfo }) => {
		const entrypoint = entrypoints[subpath]!.resolutions[resolutionKind];
		const typesFileName = entrypoint.resolution?.fileName;
		const implementationFileName = entrypoint.implementationResolution?.fileName;
		return [
			typesFileName,
			implementationFileName,
			typesFileName ? programInfo[resolutionOption]?.moduleKinds?.[typesFileName] : undefined,
			implementationFileName ? programInfo[resolutionOption]?.moduleKinds?.[implementationFileName] : undefined,
		];
	},
	execute: ([typesFileName, implementationFileName, typesModuleKind, implementationModuleKind]) => {
		if (typesFileName && implementationFileName && typesModuleKind && implementationModuleKind) {
			if (
				typesModuleKind.detectedKind === ts.ModuleKind.ESNext
				&& implementationModuleKind.detectedKind === ts.ModuleKind.CommonJS
			) {
				return {
					kind: 'FalseESM',
					typesFileName,
					implementationFileName,
					typesModuleKind,
					implementationModuleKind,
				};
			} else if (
				typesModuleKind.detectedKind === ts.ModuleKind.CommonJS
				&& implementationModuleKind.detectedKind === ts.ModuleKind.ESNext
			) {
				return {
					kind: 'FalseCJS',
					typesFileName,
					implementationFileName,
					typesModuleKind,
					implementationModuleKind,
				};
			}
		}
		return;
	},
});
