// The packed test proves that brands work between two copies, but it reaches only the classes that a
// package entry exports. This source scan covers every class.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

test('every class in src has its own brand', () => {
	const problems: string[] = [];
	const fileByBrand = new Map<string, string>();
	let classCount = 0;

	for (const file of new Bun.Glob('**/*.ts').scanSync(srcDir)) {
		const source = ts.createSourceFile(file, readFileSync(join(srcDir, file), 'utf8'), ts.ScriptTarget.Latest);
		const classNames: string[] = [];
		const brandedClassNames = new Set<string>();

		const visit = (node: ts.Node) => {
			if (ts.isClassExpression(node)) problems.push(`${file}: a class expression has no name to brand`);
			if (ts.isClassDeclaration(node)) classNames.push(node.name?.text ?? '<anonymous>');
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'addBrand') {
				const [target, brand] = node.arguments;
				if (!target || !ts.isIdentifier(target) || !brand || !ts.isStringLiteral(brand)) {
					problems.push(`${file}: addBrand needs a class and a string literal`);
				} else {
					brandedClassNames.add(target.text);
					if (target.text !== brand.text) problems.push(`${file}: ${target.text} has the brand '${brand.text}'`);
					const otherFile = fileByBrand.get(brand.text);
					if (otherFile) problems.push(`${file}: the brand '${brand.text}' is also used in ${otherFile}`);
					fileByBrand.set(brand.text, file);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);

		classCount += classNames.length;
		for (const name of classNames) {
			if (!brandedClassNames.has(name)) problems.push(`${file}: ${name} has no addBrand call`);
		}
	}

	expect(problems).toEqual([]);
	expect(classCount).toBeGreaterThan(0);
});
