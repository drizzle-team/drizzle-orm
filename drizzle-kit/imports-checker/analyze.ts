import { readFileSync } from 'fs';
import type { Node } from 'ohm-js';
import JSImports from './grammar/grammar.ohm-bundle';

export type CollectionItem = {
	type: 'data' | 'types';
	source: string;
};

function recursiveRun(...args: Node[]): boolean {
	for (const arg of args) {
		if (arg.ctorName === 'Rest' || arg.ctorName === 'comment') continue;

		if (arg.ctorName === 'ImportExpr') {
			arg['analyze']();

			continue;
		}

		if (arg.isTerminal()) continue;

		for (const c of arg.children) {
			if (!recursiveRun(c)) return false;
		}
	}

	return true;
}
function init(collection: CollectionItem[]) {
	const semantics = JSImports.createSemantics();

	semantics.addOperation('analyze', {
		JSImports(arg0, arg1) {
			recursiveRun(arg0, arg1);
		},

		ImportExpr(arg0) {
			if (arg0.ctorName === 'ImportExpr_NoFrom') return;

			arg0['analyze']();
		},

		ImportExpr_From(kImport, importInner, kFrom, importSource) {
			const importType = importInner.children[0]?.ctorName === 'ImportInner_Type' ? 'types' : 'data';

			collection.push({
				source: importSource.children[1]!.sourceString!,
				type: importType,
			});
		},
	});

	return semantics;
}

export function analyze(path: string) {
	const file = readFileSync(path).toString();
	const match = JSImports.match(file, 'JSImports');

	if (match.failed()) throw new Error(`Failed to parse file: ${path}`);
	const collection: CollectionItem[] = [];

	init(collection)(match)['analyze']();
	return collection;
}