import { ClientConfig, Pool } from 'pg';
import Db from './db';

export default class DBStringConnector {
  private _url: string;

  public constructor(url: string) {
    this._url = url;
  }

  public connect = async (): Promise<Db> => {
    const config = {
      connectionString: this._url,
    } as ClientConfig;

    try {
      const pool = new Pool(config);

      await pool.connect();
      // console.log('Db connected!');

      return new Db(pool);
    } catch (e: any) {
      // console.log(`Connection error: ${e.message}`);
      throw new Error(`Connection error: ${e.message}`);
    }
  };
}
