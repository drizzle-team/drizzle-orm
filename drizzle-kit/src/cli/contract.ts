import type { GenericBuilderInternals, Simplify } from '@drizzle-team/brocli';
import type { Dialect } from '../utils/schemaValidator';
import type { Hint } from './hints';
import type { checkOptions, exportOptions, generateOptions, pullOptions, pushOptions, upOptions } from './schema';

type BrocliInputOf<TOptions extends Record<string, GenericBuilderInternals>> = Simplify<
	{
		[K in keyof TOptions]?: TOptions[K]['_']['$output'] | undefined;
	}
>;

export type GenerateOptionsInput = BrocliInputOf<typeof generateOptions> & { dialect?: Dialect };
export type PushOptionsInput = BrocliInputOf<typeof pushOptions> & { dialect?: Dialect };

/**
 * Public SDK option type; the `output` flag is omitted because the SDK always
 * runs in JSON mode internally and never accepts a caller-supplied output mode.
 * `hints` is a raw `Hint[]`, whereas the CLI `--hints` flag takes a JSON string.
 */
export type GenerateOptions = Omit<GenerateOptionsInput, 'output' | 'hints'> & { hints?: Hint[] };

/**
 * Public SDK option type; the `output` flag is omitted because the SDK always
 * runs in JSON mode internally and never accepts a caller-supplied output mode.
 * `hints` is a raw `Hint[]`, whereas the CLI `--hints` flag takes a JSON string.
 */
export type PushOptions = Omit<PushOptionsInput, 'output' | 'hints'> & { hints?: Hint[] };

export type CheckOptionsInput = BrocliInputOf<typeof checkOptions> & { dialect?: Dialect };

export type CheckOptions = Omit<CheckOptionsInput, 'output'>;

export type ExportOptionsInput = BrocliInputOf<typeof exportOptions> & { dialect?: Dialect };

export type ExportOptions = Omit<ExportOptionsInput, 'output'>;

export type UpOptionsInput = BrocliInputOf<typeof upOptions> & { dialect?: Dialect };

export type UpOptions = Omit<UpOptionsInput, 'output'>;

export type PullOptionsInput = BrocliInputOf<typeof pullOptions> & { dialect?: Dialect };

export type PullOptions = Omit<PullOptionsInput, 'output'>;
