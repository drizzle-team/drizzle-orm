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
import SelectResponseThreeJoins from '../responses/selectResponseThreeJoins';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithFourJoins from './selectWithFourJoins';

export default class SelectTRBWithThreeJoins<TTable extends AbstractTable<TTable>,
 TTable1, TTable2, TTable3>
  extends AbstractJoined<TTable> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;
  private _join3: Join<TTable3>;

  public constructor(tableName: string, session: Session,
    filter: Expr, join1: Join<TTable1>, join2: Join<TTable2>, join3: Join<TTable3>,
    columns: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    table: TTable) {
    super(filter, tableName, session, columns, table);
    this._join1 = join1;
    this._join2 = join2;
    this._join3 = join3;
  }

  public innerJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithFourJoins(
      this._tableName,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._columns,
      this._table,
    );
  }

  public leftJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithFourJoins(
      this._tableName,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._columns,
      this._table,
    );
  }

  public rightJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithFourJoins(
      this._tableName,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._columns,
      this._table,
    );
  }

  public fullJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn>,
    to: (table: IToTable) => AbstractColumn<TColumn>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithFourJoins(
      this._tableName,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._columns,
      this._table,
    );
  }

  // eslint-disable-next-line max-len
  public execute = async (): Promise<SelectResponseThreeJoins<TTable, TTable1, TTable2, TTable3>> => {
    const queryBuilder = Select.from(this._tableName, Object.values(this._columns));
    if (this._filter) {
      queryBuilder.filteredBy(this._filter);
    }

    queryBuilder.joined([this._join1, this._join2, this._join3]);

    let query = '';
    try {
      query = queryBuilder.build();
    } catch (e) {
      throw new BuilderError(BuilderType.TWO_JOINED_SELECT,
        this._tableName, Object.values(this._columns), e, this._filter);
    }

    const parent: {
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>
    } = this._join1.mappedServiceToDb;
    const parentTwo:{
      [name in keyof ExtractModel<TTable2>]: AbstractColumn<ColumnType>;
    } = this._join2.mappedServiceToDb;
    const parentThree:{
      [name in keyof ExtractModel<TTable3>]: AbstractColumn<ColumnType>;
    } = this._join3.mappedServiceToDb;

    const result = await this._session.execute(query);
    if (result.isLeft()) {
      const { reason } = result.value;
      throw new DatabaseSelectError(this._tableName, reason, query);
    } else {
      const response = QueryResponseMapper.map(this._columns, result.value);
      const objects = QueryResponseMapper.map(parent, result.value);
      const objectsTwo = QueryResponseMapper.map(parentTwo, result.value);
      const objectsThree = QueryResponseMapper.map(parentThree, result.value);

      return new SelectResponseThreeJoins(response, objects, objectsTwo, objectsThree);
    }
  };
}
