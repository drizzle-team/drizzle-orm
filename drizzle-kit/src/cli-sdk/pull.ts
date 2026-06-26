import { runWithCliContext } from '../cli/context';
import type { PullOptions } from '../cli/contract';
import { errorToEnvelope } from '../cli/errors';
import { preparePull, runPull } from '../cli/schema';

export const pull = (opts: PullOptions) =>
	runWithCliContext({ output: 'json', interactive: false }, async () => {
		try {
			const cfg = await preparePull(opts as Parameters<typeof preparePull>[0]);
			return await runPull(cfg);
		} catch (e) {
			return errorToEnvelope(e);
		}
	});
