import ColumnType from '../../columns/types/columnType';
import AbstractTable from '../../tables/abstractTable';
import JoinWith from './joinWith';

const to = <TTable extends AbstractTable<TTable>>(table: AbstractTable<TTable>):
JoinWith<ColumnType, TTable> => new JoinWith(table.tableName(), table.mapServiceToDb());

// eslint-disable-next-line import/prefer-default-export
export default to;
