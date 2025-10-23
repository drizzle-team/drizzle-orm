import path from 'node:path';
import { ThreadWorker } from 'poolifier-web-worker';
import { parse, print, visit } from 'recast';
import parser from 'recast/parsers/typescript';

export default new ThreadWorker<{
	content: string;
	name: string;
	extension: string;
}, any>(async (data) => {
	if (!data) return;
	const { content, name, extension } = data;
	const code = parse(content, { parser });

	visit(code, {
		visitImportDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, name, extension);
			this.traverse(path);
		},
		visitExportAllDeclaration(path) {
			path.value.source.value = fixImportPath(path.value.source.value, name, extension);
			this.traverse(path);
		},
		visitExportNamedDeclaration(path) {
			if (path.value.source) {
				path.value.source.value = fixImportPath(path.value.source.value, name, extension);
			}
			this.traverse(path);
		},
		visitCallExpression(path) {
			if (path.value.callee.type === 'Identifier' && path.value.callee.name === 'require') {
				path.value.arguments[0].value = fixImportPath(path.value.arguments[0].value, name, extension);
			}
			this.traverse(path);
		},
		visitTSImportType(path) {
			path.value.argument.value = resolvePathAlias(path.value.argument.value, name);
			this.traverse(path);
		},
		visitAwaitExpression(path) {
			if (print(path.value).code.startsWith(`await import("./`)) {
				path.value.argument.arguments[0].value = fixImportPath(path.value.argument.arguments[0].value, name, extension);
			}
			this.traverse(path);
		},
	});

	return {
		code: print(code).code,
		name,
	};
});

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
