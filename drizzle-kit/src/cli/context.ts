import { AsyncLocalStorage } from 'node:async_hooks';

export type CliContext = {
	output: 'text' | 'json';
	interactive: boolean;
};

const cliContext = new AsyncLocalStorage<CliContext>();

export const runWithCliContext = <T>(context: CliContext, callback: () => T): T => {
	return cliContext.run(context, callback);
};

export const getCliContext = (): CliContext => {
	return cliContext.getStore() ?? { output: 'text', interactive: false };
};

export const outputFormat = (): 'text' | 'json' => {
	return getCliContext().output;
};

export const isInteractive = (): boolean => {
	return getCliContext().interactive;
};

/** Mutates the active AsyncLocalStorage frame in place; must be called from inside an existing `runWithCliContext` frame (e.g. from a brocli `transform` hook). Does NOT create a new frame. */
export const setCliContext = (context: CliContext): void => {
	cliContext.enterWith(context);
};
