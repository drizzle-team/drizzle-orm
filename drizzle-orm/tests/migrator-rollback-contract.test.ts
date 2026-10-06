import { globSync } from 'glob';
import { Node, Project, type Signature, ts } from 'ts-morph';
import { expect, test } from 'vitest';

const project = new Project({ tsConfigFilePath: './tsconfig.build.json', skipAddingFilesFromTsConfig: true });

// `*migrator.ts`, not `*/migrator.ts`: bundled drivers ship variants like `tursodatabase/wasm-migrator.ts`
const migratorFiles = globSync('src/**/*migrator.ts').filter((path) => path !== 'src/migrator.ts').sort();

for (const path of migratorFiles) project.addSourceFileAtPath(path);
project.resolveSourceFileDependencies();

function exportedSignatures(path: string, name: string): Signature[] {
	const [decl] = project.getSourceFileOrThrow(path).getExportedDeclarations().get(name) ?? [];
	return decl?.getType().getCallSignatures() ?? [];
}

function paramTypes(signature: Signature, at: Node) {
	return signature.getParameters().map((param) => {
		const decl = param.getValueDeclaration();
		return {
			name: param.getName(),
			optional: Node.isParameterDeclaration(decl) && decl.isOptional(),
			type: param.getTypeAtLocation(at).getNonNullableType().getText(at, ts.TypeFormatFlags.NoTruncation),
		};
	});
}

test('migrator files are discovered', () => {
	expect(migratorFiles.length).toBeGreaterThan(40);
});

for (const path of migratorFiles) {
	const migrateOverloads = exportedSignatures(path, 'migrate');
	if (!migrateOverloads.length) continue;

	test(`${path} exports rollback(...migrate params, steps?)`, () => {
		const rollbackOverloads = exportedSignatures(path, 'rollback');
		expect(rollbackOverloads.length, `${path}: one rollback() overload per migrate() overload`).toBe(
			migrateOverloads.length,
		);

		const at = project.getSourceFileOrThrow(path);
		migrateOverloads.forEach((migrate, i) => {
			const migrateParams = paramTypes(migrate, at);
			const rollbackParams = paramTypes(rollbackOverloads[i]!, at);

			expect(rollbackParams.slice(0, migrateParams.length)).toStrictEqual(migrateParams);
			expect(rollbackParams.slice(migrateParams.length)).toStrictEqual([
				{ name: 'steps', optional: true, type: 'number' },
			]);
		});
	});
}
