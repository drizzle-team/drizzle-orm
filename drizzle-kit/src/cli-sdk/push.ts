import { runWithCliContext } from '../cli/context';
import type { PushOptions } from '../cli/contract';
import { errorToEnvelope } from '../cli/errors';
import { preparePush, runPush } from '../cli/schema';

export const push = (opts: PushOptions) =>
	runWithCliContext({ output: 'json', interactive: false }, async () => {
		try {
			const cfg = await preparePush(opts as Parameters<typeof preparePush>[0]);
			return await runPush(cfg);
		} catch (e) {
			return errorToEnvelope(e);
		}
	});
