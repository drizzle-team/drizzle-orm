import type { UntypedResult } from '../types.ts';

export function untyped(analysis: UntypedResult) {
	return 'This package does not contain types.\nDetails: ' + JSON.stringify(analysis, null, 2);
}
