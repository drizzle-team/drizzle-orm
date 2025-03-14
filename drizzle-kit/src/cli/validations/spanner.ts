import { boolean, coerce, object, string, TypeOf, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';
import { outputs } from './outputs';

// TODO: SPANNER - add proper credentials config

export const spannerCredentials = object({
	projectId: string().min(1),
	instanceId: string().min(1),
	databaseId: string().min(1),
});

export type SpannerCredentials = TypeOf<typeof spannerCredentials>;

// TODO: SPANNER - add proper connection issues
// export const printCliConnectionIssues = (options: any) => {
	// const { uri, host, database } = options || {};

	// if (!uri && (!host || !database)) {
	// 	console.log(outputs.googlesql.connection.required());
	// }
// };

// TODO: SPANNER - add proper connection issues
export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	let text = `Please provide required params for Spanner driver:\n`;
	console.log(error(text));
	console.log(wrapParam('projectId', options.projectId));
	console.log(wrapParam('instanceId', options.instanceId));
	console.log(wrapParam('databaseId', options.databaseId));
	process.exit(1);
};
