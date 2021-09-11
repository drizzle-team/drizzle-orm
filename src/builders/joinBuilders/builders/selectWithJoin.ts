/* eslint-disable import/no-cycle */
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import Session from '../../../db/session';
import BuilderError, { BuilderType } from '../../../errors/builderError';
import { DatabaseSelectError } from '../../../errors/dbErrors';
import QueryResponseMapper from '../../../mappers/responseMapper';
import AbstractTable from '../../../tables/abstractTable';
import { ExtractModel } from '../../../tables/inferTypes';
import Select from '../../lowLvlBuilders/selects/select';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseJoin from '../responses/selectResponseWithJoin';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithTwoJoins from './selectWithTwoJoins';

export default class SelectTRBWithJoin<TTable extends AbstractTable<TTable>, TTable1>
  extends AbstractJoined<TTable> {
  private _join: Join<TTable1>;

  public constructor(tableName: string, session: Session,
    filter: Expr,
    join: Join<TTable1>,
    columns: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    table: TTable) {
    super(filter, tableName, session, columns, table);
    this._join = join;
  }

  public innerJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithTwoJoins(this._tableName, this._session,
      this._filter, this._join, join, this._columns, this._table);
  }

  public leftJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithTwoJoins(this._tableName, this._session,
      this._filter, this._join, join, this._columns, this._table);
  }

  public rightJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithTwoJoins(this._tableName, this._session,
      this._filter, this._join, join, this._columns, this._table);
  }

  public fullJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn>,
    to: (table: IToTable) => AbstractColumn<TColumn>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithTwoJoins(
      this._tableName,
      this._session,
      this._filter,
      this._join,
      join,
      this._columns,
      this._table,
    );
  }

  public execute = async (): Promise<SelectResponseJoin<TTable, TTable1>> => {
    const queryBuilder = Select.from(this._tableName, Object.values(this._columns));
    if (this._filter) {
      queryBuilder.filteredBy(this._filter);
    }

    queryBuilder.joined([this._join]);

    let query = '';
    try {
      query = queryBuilder.build();
    } catch (e: any) {
      throw new BuilderError(BuilderType.JOINED_SELECT,
        this._tableName, Object.values(this._columns), e, this._filter);
    }

    console.log(query);

    const parent: {
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>;
    } = this._join.mappedServiceToDb;

    const result = await this._session.execute(query);
    if (result.isLeft()) {
      const { reason } = result.value;
      throw new DatabaseSelectError(this._tableName, reason, query);
    } else {
      const response = QueryResponseMapper.map(this._columns, result.value);
      const objects = QueryResponseMapper.map(parent, result.value);

      return new SelectResponseJoin(response, objects);
    }
  };
}
