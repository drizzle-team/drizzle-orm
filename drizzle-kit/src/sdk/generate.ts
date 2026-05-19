import { runWithCliContext } from '../cli/context';
import type { GenerateOptions } from '../cli/contract';
import { errorToEnvelope } from '../cli/errors';
import { prepareGenerate, runGenerate } from '../cli/schema';

export const generate = (opts: GenerateOptions) =>
	runWithCliContext({ json: true }, async () => {
		try {
			const cfg = await prepareGenerate({ ...opts, json: true } as Parameters<typeof prepareGenerate>[0]);
			return await runGenerate(cfg);
		} catch (e) {
			return errorToEnvelope(e);
		}
	});
