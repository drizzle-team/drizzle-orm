#!/usr/bin/env -S pnpm tsx
import 'zx/globals';

import path from 'node:path';
import { parse, print, visit } from 'recast';
import parser from 'recast/parsers/typescript';

function resolvePathAlias(importPath: string, file: string) {
	if (importPath.startsWith('~/')) {
		const relativePath = path.relative(path.dirname(file), path.resolve('dist.new', importPath.slice(2)));
		importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
	}

	return importPath;
}

function fixImportPath(importPath: string, file: string, ext: string) {
	importPath = resolvePathAlias(importPath, file);

	if (!/\..*\.(js|ts)$/.test(importPath)) {
		return importPath;
	}

	return importPath.replace(/\.(js|ts)$/, ext);
}

const cjsFiles = await glob('dist/**/*.{cjs,d.cts}');

await Promise.all(cjsFiles.map(async (file) => {
	const code = parse(await fs.readFile(file, 'utf8'), { parser });

	visit(code, {
		visitImportDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, file, '.cjs');
			this.traverse(path);
		},
		visitExportAllDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, file, '.cjs');
			this.traverse(path);
		},
		visitExportNamedDeclaration(path) {
			if (path.value.source) {
				path.value.source.value = fixImportPath(path.value.source.value, file, '.cjs');
			}
			this.traverse(path);
		},
		visitCallExpression(path) {
			if (path.value.callee.type === 'Identifier' && path.value.callee.name === 'require') {
				path.value.arguments[0].value = fixImportPath(path.value.arguments[0].value, file, '.cjs');
			}
			this.traverse(path);
		},
		visitTSImportType(path) {
			path.value.argument.value = resolvePathAlias(path.value.argument.value, file);
			this.traverse(path);
		},
		visitAwaitExpression(path) {
			if (print(path.value).code.startsWith(`await import("./`)) {
				path.value.argument.arguments[0].value = fixImportPath(path.value.argument.arguments[0].value, file, '.cjs');
			}
			this.traverse(path);
		},
	});

	await fs.writeFile(file, print(code).code);
}));

let esmFiles = await glob('dist/**/*.{js,d.ts}');

await Promise.all(esmFiles.map(async (file) => {
	const code = parse(await fs.readFile(file, 'utf8'), { parser });

	visit(code, {
		visitImportDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, file, '.js');
			this.traverse(path);
		},
		visitExportAllDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, file, '.js');
			this.traverse(path);
		},
		visitExportNamedDeclaration(path) {
			if (path.value.source) {
				path.value.source.value = fixImportPath(path.value.source.value, file, '.js');
			}
			this.traverse(path);
		},
		visitTSImportType(path) {
			path.value.argument.value = fixImportPath(path.value.argument.value, file, '.js');
			this.traverse(path);
		},
		visitAwaitExpression(path) {
			if (print(path.value).code.startsWith(`await import("./`)) {
				path.value.argument.arguments[0].value = fixImportPath(path.value.argument.arguments[0].value, file, '.js');
			}
			this.traverse(path);
		},
	});

	await fs.writeFile(file, print(code).code);
}));

esmFiles = await glob('dist/**/*.{mjs,d.mts}');

await Promise.all(esmFiles.map(async (file) => {
	const code = parse(await fs.readFile(file, 'utf8'), { parser });

	visit(code, {
		visitImportDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, file, '.mjs');
			this.traverse(path);
		},
		visitExportAllDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, file, '.mjs');
			this.traverse(path);
		},
		visitExportNamedDeclaration(path) {
			if (path.value.source) {
				path.value.source.value = fixImportPath(path.value.source.value, file, '.mjs');
			}
			this.traverse(path);
		},
		visitTSImportType(path) {
			path.value.argument.value = fixImportPath(path.value.argument.value, file, '.mjs');
			this.traverse(path);
		},
		visitAwaitExpression(path) {
			if (print(path.value).code.startsWith(`await import("./`)) {
				path.value.argument.arguments[0].value = fixImportPath(path.value.argument.arguments[0].value, file, '.mjs');
			}
			this.traverse(path);
		},
	});

	await fs.writeFile(file, print(code).code);
}));
