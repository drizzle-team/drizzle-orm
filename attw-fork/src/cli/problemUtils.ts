import type * as core from '../index.ts';
import type { ProblemKind } from '../index.ts';

export const problemFlags = {
	NoResolution: 'no-resolution',
	UntypedResolution: 'untyped-resolution',
	FalseCJS: 'false-cjs',
	FalseESM: 'false-esm',
	CJSResolvesToESM: 'cjs-resolves-to-esm',
	FallbackCondition: 'fallback-condition',
	CJSOnlyExportsDefault: 'cjs-only-exports-default',
	NamedExports: 'named-exports',
	FalseExportDefault: 'false-export-default',
	MissingExportEquals: 'missing-export-equals',
	UnexpectedModuleSyntax: 'unexpected-module-syntax',
	InternalResolutionError: 'internal-resolution-error',
} as const satisfies Record<ProblemKind, string>;

export const resolutionKinds: Record<core.ResolutionKind, string> = {
	node10: 'node10',
	'node16-cjs': 'node16 (from CJS)',
	'node16-esm': 'node16 (from ESM)',
	bundler: 'bundler',
};

export const moduleKinds = {
	1: '(CJS)',
	99: '(ESM)',
	'': '',
};
