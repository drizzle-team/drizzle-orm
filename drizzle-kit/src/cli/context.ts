import { AsyncLocalStorage } from 'node:async_hooks';

export type CliContext = {
	json: boolean;
};

const cliContext = new AsyncLocalStorage<CliContext>();

export const runWithCliContext = <T>(context: CliContext, callback: () => T): T => {
	return cliContext.run(context, callback);
};

export const getCliContext = (): CliContext => {
	return cliContext.getStore() ?? { json: false };
};

export const isJsonMode = (): boolean => {
	return getCliContext().json;
};
