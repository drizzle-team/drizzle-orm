import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import Session from '../../db/session';
import BaseLogger from '../../logger/abstractLogger';
import { ExtractModel } from '../../tables/inferTypes';

export default abstract class TableRequestBuilder<TTable> {
  protected _tableName: string;
  protected _session: Session;
  protected _mappedServiceToDb: { [name in keyof ExtractModel<TTable>]
    : AbstractColumn<ColumnType>; };

  protected _columns: AbstractColumn<ColumnType>[];
  protected _logger?: BaseLogger;

  public constructor(tableName: string,
    session: Session,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    logger?: BaseLogger) {
    this._mappedServiceToDb = mappedServiceToDb;
    this._tableName = tableName;
    this._session = session;
    this._columns = Object.values(mappedServiceToDb);
    this._logger = logger;
  }

  public all = async (): Promise<Array<ExtractModel<TTable> | undefined>> => {
    const res = await this._execute();
    return res;
  };

  public first = async (): Promise<ExtractModel<TTable> | undefined> => {
    const executionRes = await this._execute();
    // TODO add checks for undefined or null
    return executionRes[0];
  };

  protected abstract _execute(): Promise<Array<ExtractModel<TTable> | undefined>>;
}
