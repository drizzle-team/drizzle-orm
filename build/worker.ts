import MagicString from 'magic-string';
import path from 'node:path';
import { parseSync, Visitor } from 'oxc-parser';
import { ThreadWorker } from 'poolifier-web-worker';
import type { WorkerIn, WorkerOut } from '.';

export default new ThreadWorker<WorkerIn, WorkerOut>(async (data) => {
	if (!data) return [];
	const files: WorkerOut = [];

	for (const { content, name, extension } of data) {
		const code = parseSync(name, content);
		const magic = new MagicString(content);

		const visitor = new Visitor({
			ImportDeclaration(node) {
				magic.overwrite(
					node.source.start + 1,
					node.source.end - 1,
					fixImportPath(magic.slice(node.source.start + 1, node.source.end - 1), name, extension),
				);
			},
			//   visitExportAllDeclaration(path) {
			//     path.value.source.value = fixImportPath(path.value.source.value, name, extension);
			//     this.traverse(path);
			//   },
			//   visitExportNamedDeclaration(path) {
			//     if (path.value.source) {
			//       path.value.source.value = fixImportPath(path.value.source.value, name, extension);
			//     }
			//     this.traverse(path);
			//   },
			CallExpression(node) {
				if (node.callee.type === 'Identifier' && node.callee.name === 'require' && (node.arguments[0] as any)?.value) {
					magic.overwrite(
						node.arguments[0]!.start + 1,
						node.arguments[0]!.end - 1,
						fixImportPath(magic.slice(node.arguments[0]!.start + 1, node.arguments[0]!.end - 1), name, extension),
					);
				}
			},
			//   visitTSImportType(path) {
			//     path.value.argument.value = resolvePathAlias(path.value.argument.value, name);
			//     this.traverse(path);
			//   },
			// AwaitExpression(node) {
			//   const nodeStr = magic.slice(node.start, node.end);
			//   if (nodeStr.startsWith(`await import(`) && (nodeStr.includes(`"./`) || nodeStr.includes(`'./`))) {
			//     console.log(magic.slice(node.start, node.end));
			//   }
			// },
		});

		visitor.visit(code.program);
		files.push({
			code: magic.toString(),
			name,
		});
	}

	return files;
});

function resolvePathAlias(importPath: string, file: string) {
	if (importPath.startsWith('~/')) {
		const relativePath = path.relative(path.dirname(file), path.resolve('dist', importPath.slice(2)));
		importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
	}

	return importPath;
}

function fixImportPath(importPath: string, file: string, ext: string) {
	importPath = resolvePathAlias(importPath, file);

	if (!/\..*\.(js|ts|cjs|cts|mjs|mts)$/.test(importPath)) {
		return importPath;
	}

	return importPath.replace(/\.(js|ts|cjs|cts|mjs|mts)$/, ext);
}
