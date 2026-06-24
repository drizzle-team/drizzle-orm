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

test('CheckOptions has dialect and ignoreConflicts but not output', () => {
	expectTypeOf<IsKeyOf<'output', CheckOptions>>().toEqualTypeOf<false>();
	expectTypeOf<CheckOptions>().toHaveProperty('dialect');
	expectTypeOf<CheckOptions>().toHaveProperty('ignoreConflicts');
});

test('ExportOptions omits output and has no hints omit', () => {
	expectTypeOf<IsKeyOf<'output', ExportOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'hints', ExportOptions>>().toEqualTypeOf<false>();
	expectTypeOf<ExportOptions>().toHaveProperty('dialect');
	expectTypeOf<ExportOptions>().toHaveProperty('schema');
});

test('UpOptions omits output and hints, has dialect and out', () => {
	expectTypeOf<IsKeyOf<'output', UpOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'hints', UpOptions>>().toEqualTypeOf<false>();
	expectTypeOf<UpOptions>().toHaveProperty('dialect');
	expectTypeOf<UpOptions>().toHaveProperty('out');
});

test('PullOptions omits output, has dialect, out, init and config', () => {
	expectTypeOf<IsKeyOf<'output', PullOptions>>().toEqualTypeOf<false>();
	expectTypeOf<PullOptions>().toHaveProperty('dialect');
	expectTypeOf<PullOptions>().toHaveProperty('out');
	expectTypeOf<PullOptions>().toHaveProperty('init');
	expectTypeOf<PullOptions>().toHaveProperty('config');
});

test('PushOptions takes flat credentials, not a dbCredentials wrapper', () => {
	expectTypeOf<PushOptions>().toHaveProperty('url');
	expectTypeOf<PushOptions>().toHaveProperty('host');
	expectTypeOf<IsKeyOf<'dbCredentials', PushOptions>>().toEqualTypeOf<false>();
});

test('SDK hints is a raw Hint[], never a JSON string', () => {
	expectTypeOf<GenerateOptions['hints']>().toEqualTypeOf<Hint[] | undefined>();
	expectTypeOf<PushOptions['hints']>().toEqualTypeOf<Hint[] | undefined>();
});
