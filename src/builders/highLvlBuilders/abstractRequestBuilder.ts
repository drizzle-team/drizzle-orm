import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { ISession } from '../../db/session';
import BaseLogger from '../../logger/abstractLogger';
import { AbstractTable } from '../../tables';
import { ExtractModel } from '../../tables/inferTypes';

export default abstract class TableRequestBuilder<TTable extends AbstractTable<TTable>,
TPartial extends {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, TTable>}> {
  protected _table: TTable;
  protected _session: ISession;
  protected _mappedServiceToDb: { [name in keyof ExtractModel<TTable>]
    : AbstractColumn<ColumnType>; };

  protected _columns: AbstractColumn<ColumnType>[];
  protected _logger?: BaseLogger;

  public constructor(table: AbstractTable<TTable>,
    session: ISession,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    logger?: BaseLogger) {
    this._mappedServiceToDb = mappedServiceToDb;
    this._table = table as unknown as TTable;
    this._session = session;
    this._columns = Object.values(mappedServiceToDb);
    this._logger = logger;
  }

  public all = async () => {
    const res = await this._execute();
    return res;
  };

  public first = async () => {
    const executionRes = await this._execute();
    // TODO add checks for undefined or null
    return executionRes[0];
  };

  // eslint-disable-next-line max-len
  protected abstract _execute(): Promise<Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial> | undefined>>;
}
