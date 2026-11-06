import {
	applyDeltas,
	KeyCollisionError,
	reconstruct as reconstructState,
	startingState as startingStateOf,
} from '../../folder/reconstruct';
import { fromEntities } from './ddl';
import type { PostgresSnapshot } from './snapshot';

export { applyDeltas, KeyCollisionError };

// Postgres states read their entities through `fromEntities`, so the shared reconstruct code gives a PostgresDDL.
export const reconstruct = (snapshots: ReadonlyMap<string, PostgresSnapshot>, id: string) =>
	reconstructState(snapshots, id, fromEntities);

export const startingState = (snapshots: ReadonlyMap<string, PostgresSnapshot>, prevIds: string[]) =>
	startingStateOf(snapshots, prevIds, fromEntities);
