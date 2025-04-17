import { globSync } from 'glob';
import { Project } from 'ts-morph';
import { assert, test } from 'vitest';

const project = new Project({ tsConfigFilePath: './tsconfig.build.json' });

const filesList = globSync('src/**/*.ts');

for (const filePath of filesList) {
	test(filePath, () => {
		const conflicts: { name: string; files: [string, string] }[] = [];
		const exports = new Map<string, string>();

		const sourceFile = project.getSourceFileOrThrow(filePath);

		for (const decl of sourceFile.getExportDeclarations()) {
			const moduleSpecifier = decl.getModuleSpecifierValue();
			if (!moduleSpecifier || !moduleSpecifier.endsWith('.ts')) {
				continue;
			}
			const exportSourcePath = decl.getModuleSpecifierSourceFile()!.getFilePath();
			const exported = project.getSourceFileOrThrow(exportSourcePath);

			for (const symbol of exported.getExportSymbols()) {
				const name = symbol.getName();
				const from = exports.get(name);
				if (from) {
					conflicts.push({
						name,
						files: [from, moduleSpecifier],
					});
				} else {
					exports.set(name, moduleSpecifier);
				}
			}
		}

		if (conflicts.length) {
			assert.fail(
				conflicts.map(({ name, files }) => `\n- ${name} is exported from ${files.join(' and ')}`).join('\n'),
			);
		}
	});
}
