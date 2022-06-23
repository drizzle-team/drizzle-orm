/* eslint-disable max-classes-per-file */
import BaseLogger from '../logger/abstractLogger';
import { AbstractTable } from '../tables';
import { ISession } from './session';

export type TableConstructor = { new (db: DB): AbstractTable<any>};

export default class DB {
  protected _session: ISession;
  protected _logger?: BaseLogger;

  protected _cache = new Map<TableConstructor, AbstractTable<any>>();

  public constructor(session: ISession) {
    this._session = session;
  }

  public create<TTable extends AbstractTable<TTable>>(t: new (db: DB) => TTable)
    : TTable {
    if (!this._cache.has(t)) {
      // eslint-disable-next-line new-cap
      this._cache.set(t, new t(this));
    }

    return this._cache.get(t)! as TTable;
  }

  public useLogger = (logger: BaseLogger): void => {
    this._logger = logger;
  };

  public cache = () => this._cache;

  public logger = (): BaseLogger | undefined => this._logger;

  public session = (): ISession => this._session;

  protected instanceFor<TTable extends AbstractTable<TTable>>(
    t: new (db: DB) => TTable,
  ) {
    return this._cache.get(t);
  }
}
