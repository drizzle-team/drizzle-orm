import { runWithCliContext } from '../cli/context';
import type { CheckOptions } from '../cli/contract';
import { errorToEnvelope } from '../cli/errors';
import { prepareCheck, runCheck } from '../cli/schema';

export const check = (opts: CheckOptions) =>
	runWithCliContext({ output: 'json', interactive: false }, async () => {
		try {
			const cfg = await prepareCheck(opts as Parameters<typeof prepareCheck>[0]);
			return await runCheck(cfg);
		} catch (e) {
			return errorToEnvelope(e);
		}
	});
