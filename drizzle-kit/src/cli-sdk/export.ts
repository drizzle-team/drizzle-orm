import { runWithCliContext } from '../cli/context';
import type { ExportOptions } from '../cli/contract';
import { errorToEnvelope } from '../cli/errors';
import { prepareExport, runExport } from '../cli/schema';

export const exportSql = (opts: ExportOptions) =>
	runWithCliContext({ output: 'json', interactive: false }, async () => {
		try {
			const cfg = await prepareExport(opts as Parameters<typeof prepareExport>[0]);
			return await runExport(cfg);
		} catch (e) {
			return errorToEnvelope(e);
		}
	});
