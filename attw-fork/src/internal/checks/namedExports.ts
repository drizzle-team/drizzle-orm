import ts from 'typescript';
import { getResolutionOption } from '../../utils.ts';
import { defineCheck } from '../defineCheck.ts';
import { getEsmModuleNamespace } from '../esm/esmNamespace.ts';

export default defineCheck({
	name: 'NamedExports',
	dependencies: ({ entrypoints, subpath, resolutionKind, programInfo }) => {
		const entrypoint = entrypoints[subpath]!.resolutions[resolutionKind];
		const typesFileName = entrypoint.resolution?.isTypeScript && entrypoint.resolution.fileName;
		const resolutionOption = getResolutionOption(resolutionKind);
		const typesModuleKind = typesFileName ? programInfo[resolutionOption].moduleKinds?.[typesFileName] : undefined;
		const implementationFileName = entrypoint.implementationResolution?.fileName;
		const implementationModuleKind = implementationFileName
			? programInfo[resolutionOption].moduleKinds?.[implementationFileName]
			: undefined;
		return [implementationFileName, implementationModuleKind, typesFileName, typesModuleKind, resolutionKind];
	},
	execute: (
		[implementationFileName, implementationModuleKind, typesFileName, typesModuleKind, resolutionKind],
		context,
	) => {
		if (
			!implementationFileName
			|| !typesFileName
			|| resolutionKind !== 'node16-esm'
			|| typesModuleKind?.detectedKind !== ts.ModuleKind.CommonJS
			|| implementationModuleKind?.detectedKind !== ts.ModuleKind.CommonJS
		) {
			return;
		}

		// Get declared exported names from TypeScript
		const host = context.hosts.findHostForFiles([typesFileName])!;
		const typesSourceFile = host.getSourceFile(typesFileName)!;
		if (typesSourceFile.scriptKind === ts.ScriptKind.JSON || !typesSourceFile.symbol) {
			return;
		}

		const typeChecker = host.createAuxiliaryProgram([typesFileName]).getTypeChecker();
		const moduleType = typeChecker.getTypeOfSymbol(typeChecker.resolveExternalModuleSymbol(typesSourceFile.symbol));
		if (typeChecker.isArrayLikeType(moduleType) || typeChecker.getPropertyOfType(moduleType, '0')) {
			return;
		}
		const expectedNames = [
			...new Set(
				typeChecker
					.getExportsAndPropertiesOfModule(typesSourceFile.symbol)
					.filter((symbol) => {
						return (
							// TS treats `prototype` and other static class members as exports. There's possibly
							// a fix to be done in TS itself, since these show up as auto-imports.
							symbol.name !== 'prototype'
							// @ts-expect-error `getSymbolFlags` extra arguments are not declared on TypeChecker
							&& typeChecker.getSymbolFlags(symbol, /*excludeTypeOnlyMeanings*/ true) & ts.SymbolFlags.Value
						);
					})
					.map((symbol) => symbol.name),
			),
		];

		// Get actual exported names as seen by nodejs
		let exports: readonly string[] | undefined;
		try {
			exports = getEsmModuleNamespace(context.pkg, implementationFileName);
		} catch {
			// If this fails then the result is indeterminate. This could happen in many cases, but
			// a common one would be for packages which re-export from another another package.
			return;
		}

		const missing = expectedNames.filter((name) => !exports.includes(name));
		if (missing.length > 0) {
			const lengthWithoutDefault = (names: readonly string[]) => names.length - (names.includes('default') ? 1 : 0);
			return {
				kind: 'NamedExports',
				implementationFileName,
				typesFileName,
				isMissingAllNamed: lengthWithoutDefault(missing) === lengthWithoutDefault(expectedNames),
				missing,
			};
		}

		return;
	},
});
