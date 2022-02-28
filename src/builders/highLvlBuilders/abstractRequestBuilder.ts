import { AbstractColumn } from "../../columns/column";
import ColumnType from "../../columns/types/columnType";
import { ISession } from "../../db/session";
import BaseLogger from "../../logger/abstractLogger";
import { AbstractTable } from "../../tables";
import { ExtractModel } from "../../tables/inferTypes";
import { ExtractColumns, PartialFor } from "../../tables/inferTypes";

export default abstract class TableRequestBuilder<
  TTable extends AbstractTable<TTable>,
  TPartial extends PartialFor<TTable> = {
    [name: string]: AbstractColumn<ColumnType>;
  }
> {
  protected _table: TTable;
  protected _session: ISession;
  protected _mappedServiceToDb: ExtractColumns<TTable>;

  protected _columns: AbstractColumn<ColumnType>[];
  protected _logger?: BaseLogger;

  public constructor(
    table: AbstractTable<TTable>,
    session: ISession,
    mappedServiceToDb: ExtractColumns<TTable>,
    logger?: BaseLogger
  ) {
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

  /**
   * Current function will return an element only if response is of length 1
   * If there are more or less than 1 element, will throw an Error
   */
  public findOne = async () => {
    const executionRes = await this._execute();
    if (executionRes.length > 1) {
      throw new Error("Request contains more than 1 element");
    } else if (executionRes.length < 1) {
      throw new Error("Request contains less than 1 element ");
    } else {
      return executionRes[0];
    }
  };

  protected abstract _execute(): Promise<ExtractModel<TPartial>[]>;
}
