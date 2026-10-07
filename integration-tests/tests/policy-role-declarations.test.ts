import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { expect, test } from 'vitest';

test('published policy and role entities implement their exact optional configuration contracts', () => {
	const fixture = fileURLToPath(new URL('./fixtures/policy-role-exact.ts', import.meta.url));
	const program = ts.createProgram([fixture], {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		target: ts.ScriptTarget.ESNext,
		strict: true,
		noEmit: true,
		skipLibCheck: false,
		exactOptionalPropertyTypes: true,
		noUncheckedIndexedAccess: true,
		types: ['node'],
	});
	expect(
		ts.getPreEmitDiagnostics(program).map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		),
	).toEqual([]);
});
