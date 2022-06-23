/* eslint-disable import/export */
import { ClientConfig } from 'pg';
import { DB, DbConnector, DBStringConnector } from './db';
import Migrator from './migrator/migrator';

export * from './db';
export * from './builders';
export * from './columns';
export * from './tables';
export * from './logger/consoleLogger';
export * from './logger/abstractLogger';

export const drizzle = {
  async connect(config: ClientConfig | string): Promise<DB> {
    if (typeof config === 'string') {
      return new DbConnector().connectionString(config).connect();
    }
    return new DbConnector().params(config).connect();
  },

  migrator(db: DB): Migrator {
    return new Migrator(db);
  },
};
