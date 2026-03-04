import type { problemFlags, resolutionKinds } from './problemUtils.ts';

export type Format = 'auto' | 'table' | 'table-flipped' | 'ascii' | 'json' | 'concise';
export interface RenderOptions {
	ignoreRules?: (typeof problemFlags)[keyof typeof problemFlags][];
	ignoreResolutions?: (keyof typeof resolutionKinds)[];
	format?: Format;
	color?: boolean;
	summary?: boolean;
	emoji?: boolean;
}
