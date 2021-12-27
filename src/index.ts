/* eslint-disable import/export */
import { ClientConfig } from 'pg';
import { DB, DbConnector } from './db';
import Migrator from './migrator/migrator';

export * from './db';
export * from './builders';
export * from './columns';
export * from './tables';

export const drizzle = {
  async connect(config: ClientConfig): Promise<DB> {
    const dbConnector: DbConnector = new DbConnector().params(config);
    return dbConnector.connect();
  },

  migrator(db: DB): Migrator {
    return new Migrator(db);
  },
};
