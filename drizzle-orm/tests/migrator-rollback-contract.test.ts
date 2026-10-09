import { globSync } from 'glob';
import { Node, Project, type Signature, SyntaxKind, ts } from 'ts-morph';
import { expect, test } from 'vitest';

const project = new Project({ tsConfigFilePath: './tsconfig.build.json', skipAddingFilesFromTsConfig: true });

// `*migrator.ts`, not `*/migrator.ts`: bundled drivers ship variants like `tursodatabase/wasm-migrator.ts`
const migratorFiles = globSync('src/**/*migrator.ts').filter((path) => path !== 'src/migrator.ts').sort();

for (const path of migratorFiles) project.addSourceFileAtPath(path);
project.resolveSourceFileDependencies();

interface Callable {
	signatures: Signature[];
	implementation: Node | undefined;
}

function implementationOf(decl: Node): Node | undefined {
	if (Node.isFunctionDeclaration(decl)) return decl.getImplementation() ?? decl;
	// `export const rollback = Effect.fn('rollback')(function*(...) {...})`
	return decl.getFirstDescendant((node) => Node.isFunctionExpression(node) || Node.isArrowFunction(node));
}

/** The exported function `name` plus, keyed `name.member`, the functions of an exported `namespace name` */
function callables(path: string, name: string): Map<string, Callable> {
	const file = project.getSourceFileOrThrow(path);
	const result = new Map<string, Callable>();

	const decl = (file.getExportedDeclarations().get(name) ?? []).find((d) => !Node.isModuleDeclaration(d));
	if (decl) {
		result.set(name, { signatures: decl.getType().getCallSignatures(), implementation: implementationOf(decl) });
	}

	for (const member of file.getModule(name)?.getFunctions() ?? []) {
		result.set(`${name}.${member.getName()}`, {
			signatures: member.getType().getCallSignatures(),
			implementation: member.getImplementation() ?? member,
		});
	}
	return result;
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

function returnsRollbackSteps(signature: Signature): boolean {
	let type = signature.getReturnType();
	const wrapper = type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName();
	if (wrapper === 'Promise' || wrapper === 'Effect') {
		type = type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]!;
	}
	return type.isArray() && type.getArrayElementTypeOrThrow().getSymbol()?.getName() === 'RollbackStep';
}

function usesParameter(implementation: Node, name: string): boolean {
	const body = Node.isFunctionLikeDeclaration(implementation) ? implementation.getBody() : undefined;
	return !!body?.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === name);
}

test('migrator files are discovered', () => {
	expect(migratorFiles).toContain('src/node-postgres/migrator.ts');
});

for (const path of migratorFiles) {
	test(`${path} exports rollback(...migrate params, options?) for every migrate entry point`, () => {
		const at = project.getSourceFileOrThrow(path);
		const migrates = callables(path, 'migrate');
		const rollbacks = callables(path, 'rollback');
		expect(migrates.size, `${path}: no resolvable migrate() export`).toBeGreaterThan(0);

		for (const [key, migrate] of migrates) {
			const rollbackKey = key.replace(/^migrate/, 'rollback');
			const rollback = rollbacks.get(rollbackKey);
			expect(rollback, `${path}: missing ${rollbackKey}()`).toBeDefined();
			expect(rollback!.signatures.length, `${path}: one ${rollbackKey}() overload per ${key}() overload`).toBe(
				migrate.signatures.length,
			);

			migrate.signatures.forEach((migrateSignature, i) => {
				const migrateParams = paramTypes(migrateSignature, at);
				const rollbackParams = paramTypes(rollback!.signatures[i]!, at);

				expect(rollbackParams.slice(0, migrateParams.length)).toStrictEqual(migrateParams);
				expect(rollbackParams.slice(migrateParams.length)).toStrictEqual([
					{ name: 'options', optional: true, type: 'RollbackOptions' },
				]);
				expect(returnsRollbackSteps(rollback!.signatures[i]!), `${path}: ${rollbackKey}() must return RollbackStep[]`)
					.toBe(true);
			});

			expect(
				rollback!.implementation && usesParameter(rollback!.implementation, 'options'),
				`${path}: ${rollbackKey}() never passes its options on, so steps/to/dryRun would be ignored`,
			).toBe(true);
		}
	});
}
