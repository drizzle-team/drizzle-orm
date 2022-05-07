import { ClientConfig, Pool } from 'pg';
import DB from './db';
import DBStringConnector from './dbStringConnector';
import Session from './session';

export default class DbConnector {
  private __config: ClientConfig;

  public connectionString = (url: string): DBStringConnector => new DBStringConnector(url);

  public params = (config: ClientConfig): DbConnector => {
    this.__config = config;
    return this;
  };

  public connect = async (): Promise<DB> => {
    try {
      const pool = new Pool(this.__config);
      const connection = await pool.connect();
      // console.log('Db connected!');

      // check if table structure is the same as in code

      return new DB(new Session(pool, connection));
    } catch (e: any) {
      // console.log(`Connection error: ${e.message}`);
      throw new Error(`Connection error: ${e.message}`);
    }
  };
}
