import type { Exports } from 'cjs-module-lexer';
import ts from 'typescript';

// Note: There is a pretty solid module `es-module-lexer` which performs a similar lexing operation
// as `cjs-module-lexer`, but has some limitations in what it can express. This implementation
// should be more complete.

function* extractDestructedNames(node: ts.BindingName): Iterable<string> {
	switch (node.kind) {
		case ts.SyntaxKind.ArrayBindingPattern: {
			for (const element of node.elements) {
				if (element.kind === ts.SyntaxKind.BindingElement) {
					yield* extractDestructedNames(element.name);
				}
			}
			break;
		}

		case ts.SyntaxKind.Identifier: {
			yield node.text;
			break;
		}

		case ts.SyntaxKind.ObjectBindingPattern: {
			for (const element of node.elements) {
				yield* extractDestructedNames(element.name);
			}
			break;
		}

		default: {
			node satisfies never;
		}
	}
}

export function getEsmModuleBindings(sourceText: string): Exports {
	const options: ts.CreateSourceFileOptions = {
		languageVersion: ts.ScriptTarget.ESNext,
		impliedNodeFormat: ts.ModuleKind.ESNext,
	};
	const sourceFile = ts.createSourceFile('module.cjs', sourceText, options, false, ts.ScriptKind.JS);

	const exports: string[] = [];
	const reexports: string[] = [];
	for (const statement of sourceFile.statements) {
		switch (statement.kind) {
			case ts.SyntaxKind.ExportDeclaration: {
				const declaration = statement as ts.ExportDeclaration;
				const { exportClause, isTypeOnly, moduleSpecifier } = declaration;
				if (!isTypeOnly) {
					if (exportClause) {
						if (exportClause.kind === ts.SyntaxKind.NamedExports) {
							// `export { foo }`;
							// `export { foo } from 'specifier'`;
							for (const element of exportClause.elements) {
								if (!element.isTypeOnly) {
									exports.push(element.name.text);
								}
							}
						} else {
							// `export * as namespace from 'specifier'`
							exports.push(exportClause.name.text);
						}
					} else if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
						// `export * from 'specifier'`
						reexports.push(moduleSpecifier.text);
					}
				}
				break;
			}

			case ts.SyntaxKind.ExportAssignment: {
				const assignment = statement as ts.ExportAssignment;
				if (!assignment.isExportEquals) {
					// `export default ...`
					exports.push('default');
				}
				break;
			}

			case ts.SyntaxKind.ClassDeclaration:
			case ts.SyntaxKind.FunctionDeclaration: {
				const declaration = statement as ts.ClassDeclaration | ts.FunctionDeclaration;
				if (ts.hasSyntacticModifier(declaration, ts.ModifierFlags.Export)) {
					if (ts.hasSyntacticModifier(declaration, ts.ModifierFlags.Default)) {
						// `export default class {}`
						// `export default function () {}`
						exports.push('default');
					} else if (declaration.name) {
						// `export class Foo {}`
						// `export function foo() {}`
						exports.push(declaration.name.text);
					}
				}
				break;
			}

			case ts.SyntaxKind.VariableStatement: {
				const declaration = statement as ts.VariableStatement;
				if (ts.hasSyntacticModifier(declaration, ts.ModifierFlags.Export)) {
					// `export const foo = null;`
					// `export const { foo, bar } = null;`
					for (const declarator of declaration.declarationList.declarations) {
						exports.push(...extractDestructedNames(declarator.name));
					}
				}
				break;
			}
		}
	}

	return { exports, reexports };
}
