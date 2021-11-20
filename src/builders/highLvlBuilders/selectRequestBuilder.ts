/* eslint-disable import/no-cycle */
import { JoinWith, Select } from '..';
import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import DB from '../../db/db';
import Session from '../../db/session';
import BuilderError, { BuilderType } from '../../errors/builderError';
import { DatabaseSelectError } from '../../errors/dbErrors';
import BaseLogger from '../../logger/abstractLogger';
import QueryResponseMapper from '../../mappers/responseMapper';
import { AbstractTable } from '../../tables';
import { ExtractModel } from '../../tables/inferTypes';
import SelectTRBWithJoin from '../joinBuilders/builders/selectWithJoin';
import { JoinStrategy } from '../joinBuilders/join';
import Expr from '../requestBuilders/where/where';
import TableRequestBuilder from './abstractRequestBuilder';
import Order from './order';

export default class SelectTRB<TTable extends AbstractTable<TTable>>
  extends TableRequestBuilder<TTable> {
  protected _filter: Expr;
  private props: { limit?: number, offset?: number};
  private __orderBy?: AbstractColumn<ColumnType, boolean, boolean>;
  private __groupBy?: AbstractColumn<ColumnType, boolean, boolean>;
  private __order?: Order;

  public constructor(
    session: Session,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    props: {limit?:number, offset?:number},
    table: AbstractTable<TTable>,
    logger?: BaseLogger,
  ) {
    super(table, session, mappedServiceToDb, logger);
    this.props = props;
  }

  public where = (expr: Expr): SelectTRB<TTable> => {
    this._filter = expr;
    return this;
  };

  public orderBy<TColumnType extends ColumnType>(
    callback: (table: TTable) => AbstractColumn<TColumnType, boolean, boolean>,
    order: Order,
  )
    : SelectTRB<TTable> {
    this.__orderBy = callback(this._table);
    this.__order = order;
    return this;
  }

  // public groupBy(callback: (table: TTable) => Column<ColumnType, boolean, boolean>)
  //   : SelectTRB<TTable> {
  //   this.__groupBy = callback(this.__table);
  //   return this;
  // }

  public innerJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithJoin<TTable, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
    );
  }

  public leftJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithJoin<TTable, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
    );
  }

  public rightJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithJoin<TTable, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
    );
  }

  public fullJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithJoin<TTable, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
    );
  }

  public execute = async () => {
    const res = await this._execute();
    return res;
  };

  protected _execute = async (): Promise<Array<ExtractModel<TTable> | undefined>> => {
    // Select.from().filteredBy().limit().offset().orderBy().groupBy().build()
    const queryBuilder = Select
      .from(this._table)
      .filteredBy(this._filter)
      .limit(this.props.limit)
      .offset(this.props.offset)
      .orderBy(this.__orderBy, this.__order!);

    let query = '';
    try {
      query = queryBuilder.build();
    } catch (e: any) {
      throw new BuilderError(BuilderType.SELECT, this._table.tableName(),
        this._columns, e, this._filter);
    }

    if (this._logger) {
      this._logger.info(`Selecting from ${this._table.tableName()} using query:\n ${query}`);
    }

    const result = await this._session.execute(query);
    if (result.isLeft()) {
      const { reason } = result.value;
      throw new DatabaseSelectError(this._table.tableName(), reason, query);
    } else {
      return QueryResponseMapper.map(this._mappedServiceToDb, result.value);
    }
  };
}
