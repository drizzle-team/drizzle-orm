import { expectTypeOf, test } from 'vitest';
import type { GenerateOptions, PushOptions } from '../../src/cli/contract';
import type { Hint } from '../../src/cli/hints';

type IsKeyOf<K extends PropertyKey, T> = K extends keyof T ? true : false;

test('SDK option types omit the CLI-only output/json keys', () => {
	expectTypeOf<IsKeyOf<'output', GenerateOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'json', GenerateOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'output', PushOptions>>().toEqualTypeOf<false>();
	expectTypeOf<IsKeyOf<'json', PushOptions>>().toEqualTypeOf<false>();
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
