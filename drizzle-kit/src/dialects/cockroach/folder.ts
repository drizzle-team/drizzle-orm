import * as history from '../../folder/history';
import { fromEntities } from './ddl';
import type { CockroachSnapshot } from './snapshot';

// The cockroach binder for the shared folder rules.
const dialect: history.FolderDialect<ReturnType<typeof fromEntities>> = {
	dialect: 'cockroach',
	snapshotDialect: 'cockroach',
	fromEntities,
};

export const sortsAfter = history.sortsAfter;
export const readEntries = history.readEntries;
export const loadFolder = history.loadFolder;

export type CockroachMigrationsFolder = history.MigrationsFolder<CockroachSnapshot>;

export const readFolder = (out: string) => history.readFolder<CockroachSnapshot>(out, dialect);
export const withoutMigrations = (migrations: CockroachMigrationsFolder, deleted: string[]) =>
	history.withoutMigrations(migrations, deleted);
export const leafFolders = (migrations: CockroachMigrationsFolder) => history.leafFolders(migrations);
export const stateOf = (migrations: CockroachMigrationsFolder, id: string) => history.stateOf(migrations, id, dialect);
export const combinedState = (migrations: CockroachMigrationsFolder) => history.combinedState(migrations, dialect);
