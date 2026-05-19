import type { GenericBuilderInternals, Simplify } from '@drizzle-team/brocli';
import type { Dialect } from '../utils/schemaValidator';
import type { generateOptions, pushOptions } from './schema';

type BrocliInputOf<TOptions extends Record<string, GenericBuilderInternals>> = Simplify<
	{
		[K in keyof TOptions]?: TOptions[K]['_']['$output'] | undefined;
	}
>;

/**
 * Derived from the brocli option block in src/cli/schema.ts via the local
 * BrocliInputOf<> helper; the json flag is omitted because the SDK always runs
 * in JSON mode internally.
 */
export type GenerateOptions =
	& Omit<BrocliInputOf<typeof generateOptions>, 'json'>
	& { dialect?: Dialect };

/**
 * Derived from the brocli option block in src/cli/schema.ts via the local
 * BrocliInputOf<> helper; the json flag is omitted because the SDK always runs
 * in JSON mode internally.
 */
export type PushOptions =
	& Omit<BrocliInputOf<typeof pushOptions>, 'json'>
	& { dialect?: Dialect };
