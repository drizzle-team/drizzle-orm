import { runWithCliContext } from '../cli/context';
import type { UpOptions } from '../cli/contract';
import { errorToEnvelope } from '../cli/errors';
import { prepareUp, runUp } from '../cli/schema';

export const up = (opts: UpOptions) =>
	runWithCliContext({ output: 'json', interactive: false }, async () => {
		try {
			const cfg = await prepareUp(opts as Parameters<typeof prepareUp>[0]);
			return await runUp(cfg);
		} catch (e) {
			return errorToEnvelope(e);
		}
	});
