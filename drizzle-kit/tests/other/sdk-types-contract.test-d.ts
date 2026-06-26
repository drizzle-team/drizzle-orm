import { expectTypeOf, test } from 'vitest';
import type {
	CheckOptions,
	ExportOptions,
	GenerateOptions,
	PullOptions,
	PushOptions,
	UpOptions,
} from '../../src/cli/contract';
import type { Hint } from '../../src/cli/hints';

type IsKeyOf<K extends PropertyKey, T> = K extends keyof T ? true : false;

test('SDK option types omit the CLI-only output/json keys', () => {
	expectTypeOf<IsKeyOf<'output', GenerateOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'json', GenerateOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'output', PushOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'json', PushOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'output', CheckOptions>>().toEqualTypeOf<false>();
});

test('CheckOptions omits output', () => {
	expectTypeOf<IsKeyOf<'output', CheckOptions>>().toEqualTypeOf<false>();
});

test('ExportOptions omits output and hints', () => {
	expectTypeOf<IsKeyOf<'output', ExportOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'hints', ExportOptions>>().toEqualTypeOf<false>();
});

test('UpOptions omits output and hints', () => {
	expectTypeOf<IsKeyOf<'output', UpOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'hints', UpOptions>>().toEqualTypeOf<false>();
});

test('PullOptions omits output', () => {
	expectTypeOf<IsKeyOf<'output', PullOptions>>().toEqualTypeOf<false>();
});

test('PushOptions takes flat credentials, not a dbCredentials wrapper', () => {
	expectTypeOf<IsKeyOf<'dbCredentials', PushOptions>>().toEqualTypeOf<false>();
});

test('SDK hints is a raw Hint[], never a JSON string', () => {
	expectTypeOf<GenerateOptions['hints']>().toEqualTypeOf<Hint[] | undefined>();
	expectTypeOf<PushOptions['hints']>().toEqualTypeOf<Hint[] | undefined>();
});
