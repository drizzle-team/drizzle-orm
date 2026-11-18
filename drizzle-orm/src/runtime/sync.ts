import { DrizzleQueryError } from '~/errors.ts';
import { type QueryProgram, type QueryRuntime, runProgram } from './core.ts';

export const syncQueryRuntime: QueryRuntime = {
	suspend: (body) => body(),
	chain: (first, next) => next(first),
	detach: (work) => work(),
	attempt(run, onError) {
		try {
			return run();
		} catch (e) {
			throw onError(e);
		}
	},
	queryError: (query, params, cause) => new DrizzleQueryError(query, params, cause as Error),
};

export const runSyncProgram = <A>(body: () => QueryProgram<A>): A => runProgram(syncQueryRuntime, body) as A;
