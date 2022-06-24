/* eslint-disable import/export */
import { ClientConfig } from 'pg';
import {
  DB, DbConnector, DBStringConnector, ISession,
} from './db';
import Migrator from './migrator/migrator';

export * from './db';
export * from './builders';
export * from './columns';
export * from './tables';
export * from './logger/consoleLogger';
export * from './logger/abstractLogger';

export interface DbAdapter extends ISession {

}

export const drizzle = {
  async connect(config: ClientConfig | string): Promise<DB> {
    if (typeof config === 'string') {
      return new DbConnector().connectionString(config).connect();
    }
    return new DbConnector().params(config).connect();
  },

  async connectWith(adapter: ISession): Promise<DB> {
    return new DB(adapter);
  },

  migrator(db: DB): Migrator {
    return new Migrator(db);
  },
};
