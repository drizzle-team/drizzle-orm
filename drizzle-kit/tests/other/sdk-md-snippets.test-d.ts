import { expectTypeOf, test } from 'vitest';
import { check, exportSql, generate, pull, push, up } from '../../src/cli-sdk';
import type { GenerateOptions, PushOptions } from '../../src/cli/contract';
import type { Hint } from '../../src/cli/hints';
import { defineConfig } from '../../src/index';
import type { Config } from '../../src/index';

type GenerateResponse = Awaited<ReturnType<typeof generate>>;
type PushResponse = Awaited<ReturnType<typeof push>>;
type CheckResponse = Awaited<ReturnType<typeof check>>;
type PullResponse = Awaited<ReturnType<typeof pull>>;
type UpResponse = Awaited<ReturnType<typeof up>>;
type ExportResponse = Awaited<ReturnType<typeof exportSql>>;
type Unresolved = Extract<GenerateResponse, { status: 'missing_hints' }>['unresolved'][number];

declare const generateResponse: GenerateResponse;
declare const pushResponse: PushResponse;
declare const checkResponse: CheckResponse;
declare const pullResponse: PullResponse;
declare const upResponse: UpResponse;
declare const exportResponse: ExportResponse;
declare function resolveHint(item: Unresolved): Hint;
declare const config: Config;

// Compiled (so the snippets are type-checked) but never invoked at runtime, since
// the ambient `declare`d values above have no runtime representation.
function _generateNarrowing() {
	if (generateResponse.status === 'ok') {
		if ('migration_path' in generateResponse) {
			expectTypeOf(generateResponse.migration_path).toEqualTypeOf<string>();
		}
	} else if (generateResponse.status === 'no_changes') {
		expectTypeOf(generateResponse.dialect).toExtend<string | undefined>();
	} else if (generateResponse.status === 'error') {
		expectTypeOf(generateResponse.error.code).toBeString();
	} else if (generateResponse.status === 'missing_hints') {
		expectTypeOf(generateResponse.unresolved).toEqualTypeOf<readonly Unresolved[]>();
	}
}

function _pushNarrowing() {
	if (pushResponse.status === 'ok') {
		expectTypeOf(pushResponse.dialect).toExtend<string | undefined>();
	} else if (pushResponse.status === 'no_changes') {
		expectTypeOf(pushResponse.dialect).toExtend<string | undefined>();
	} else if (pushResponse.status === 'error') {
		expectTypeOf(pushResponse.error.code).toBeString();
	}
}

function _checkNarrowing() {
	if (checkResponse.status === 'ok') {
		expectTypeOf(checkResponse.dialect).toExtend<string | undefined>();
	} else if (checkResponse.status === 'error') {
		expectTypeOf(checkResponse.error.code).toBeString();
	}
}

function _pullNarrowing() {
	if (pullResponse.status === 'ok') {
		expectTypeOf(pullResponse.schemaPath).toBeString();
		expectTypeOf(pullResponse.snapshotPath).toBeString();
	} else if (pullResponse.status === 'error') {
		expectTypeOf(pullResponse.error.code).toBeString();
	}
}

function _upNarrowing() {
	if (upResponse.status === 'ok') {
		expectTypeOf(upResponse.upgraded).toEqualTypeOf<string[]>();
	} else if (upResponse.status === 'error') {
		expectTypeOf(upResponse.error.code).toBeString();
	}
}

function _exportNarrowing() {
	if (exportResponse.status === 'ok') {
		expectTypeOf(exportResponse.statements).toEqualTypeOf<string[]>();
		expectTypeOf(exportResponse.warnings).toEqualTypeOf<string[]>();
	} else if (exportResponse.status === 'error') {
		expectTypeOf(exportResponse.error.code).toBeString();
	}
}

async function _generateWithHints(): Promise<GenerateResponse> {
	const baseOptions: GenerateOptions = {
		dialect: 'postgresql',
		schema: './src/db/schema.ts',
		out: './drizzle',
	};

	const first: GenerateResponse = await generate(baseOptions);
	if (first.status !== 'missing_hints') return first;

	const hints = first.unresolved.map((item) => resolveHint(item));
	expectTypeOf(hints).toEqualTypeOf<Hint[]>();

	return generate({
		...baseOptions,
		hints,
	});
}

function _defineConfigSnippet() {
	const _config = defineConfig(config);
	return _config;
}

// The narrowing snippets above are the substantive checks — they type-check at compile time.
// Reference them so they are not flagged as unused; their bodies are what is under test.
void [
	_generateNarrowing,
	_pushNarrowing,
	_checkNarrowing,
	_pullNarrowing,
	_upNarrowing,
	_exportNarrowing,
	_defineConfigSnippet,
];

test('generateWithHints re-invokes generate with a raw Hint[]', () => {
	expectTypeOf(_generateWithHints).returns.resolves.toEqualTypeOf<GenerateResponse>();
});

test('push options stay typed', () => {
	expectTypeOf<PushOptions>().toExtend<{ dialect?: unknown }>();
});
