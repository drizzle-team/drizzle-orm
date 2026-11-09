import * as history from '../../folder/history';
import { fromEntities } from './ddl';
import type { PostgresSnapshot } from './snapshot';

// The postgres binder for the shared folder rules. The shared module holds the logic and the messages.
const dialect: history.FolderDialect<ReturnType<typeof fromEntities>> = {
	dialect: 'postgresql',
	snapshotDialect: 'postgres',
	fromEntities,
};

export type { FolderEntry } from '../../folder/history';
export type MigrationsFolder = history.MigrationsFolder<PostgresSnapshot>;

export const sortsAfter = history.sortsAfter;
export const folderOrderError = history.folderOrderError;
export const readEntries = history.readEntries;
export const loadFolder = history.loadFolder;

export const assertHistory = (entries: history.FolderEntry[]) => history.assertHistory(entries, dialect);
export const validFiles = (entries: history.FolderEntry[]) => history.validFiles<PostgresSnapshot>(entries, dialect);
export const readFolder = (out: string) => history.readFolder<PostgresSnapshot>(out, dialect);
export const withoutMigrations = (
	migrations: history.MigrationsFolder<PostgresSnapshot>,
	deleted: string[],
) => history.withoutMigrations(migrations, deleted);
export const leafFolders = (migrations: history.MigrationsFolder<PostgresSnapshot>) => history.leafFolders(migrations);
export const stateOf = (migrations: history.MigrationsFolder<PostgresSnapshot>, id: string) =>
	history.stateOf(migrations, id, dialect);
export const combinedState = (migrations: history.MigrationsFolder<PostgresSnapshot>) =>
	history.combinedState(migrations, dialect);
