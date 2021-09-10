import { Column } from '../../columns/column';
import PgEnum from '../../columns/types/pgEnum';
import AbstractTable from '../../tables/abstractTable';
import { ecranate } from '../../utils/ecranate';

export default class Create<TTable extends AbstractTable<TTable>> {
  private tableBuilder: Array<string> = [];
  private enumBuilder: Array<string> = [];
  private columnsBuilder: Array<string> = [];
  private primaryKey: Array<string> = [];
  private uniqueKey: Array<string> = [];
  private tableClass: AbstractTable<TTable>;

  private constructor(tableClass: AbstractTable<TTable>) {
    this.tableClass = tableClass;
  }

  public static table = <StaticTTable extends AbstractTable<StaticTTable>>(tableClass:
  AbstractTable<StaticTTable>): Create<StaticTTable> => new Create(tableClass);

  public build = (): string => {
    this.tableBuilder.push('CREATE TABLE IF NOT EXISTS ');
    this.tableBuilder.push(this.tableClass.tableName());
    this.tableBuilder.push(' (');

    const tableValues = Object.values(this.tableClass);
    const columns = tableValues.filter((value) => value instanceof Column);
    for (let i = 0; i < columns.length; i += 1) {
      const column = columns[i];

      if (column instanceof Column) {
        const columnType = column.getColumnType();
        if (columnType instanceof PgEnum) {
          // eslint-disable-next-line new-cap
          const enumValues = Object.values(columnType.codeType) as string[];

          let resValue = '';
          for (let j = 0; j < enumValues.length; j += 1) {
            resValue += `'${enumValues[j]}'`;
            if (j !== enumValues.length - 1) {
              resValue += ',';
            }
          }
          this.enumBuilder.push(`DO $$ BEGIN
          CREATE TYPE ${columnType.dbName} AS ENUM (${resValue});
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;`);
        }
        this.columnsBuilder.push(ecranate(column.getColumnName()));
        this.columnsBuilder.push(' ');
        this.columnsBuilder.push(column.isAutoIncrement() ? 'SERIAL' : column.getColumnType().getDbName());
        this.columnsBuilder.push(' ');
        this.columnsBuilder.push(column.getDefaultValue() != null ? `DEFAULT ${column.getColumnType().insertStrategy(column.getDefaultValue())}` : '');
        this.columnsBuilder.push(column.isNullableFlag ? '' : ' NOT NULL');

        const referenced = column.getReferenced();
        this.columnsBuilder.push(referenced != null ? ` REFERENCES ${referenced.getParentName()} (${referenced.getColumnName()})` : '');

        if (i !== columns.length - 1) {
          this.columnsBuilder.push(',');
        }
      }
    }

    const primaryKeys: Column<any>[] = [];
    const uniqueKeys: Column<any>[] = [];

    Object.values(this.tableClass).forEach((field) => {
      if (field instanceof Column) {
        if (field.primaryKeyName) {
          primaryKeys.push(field);
        }
        if (field.uniqueKeyName) {
          uniqueKeys.push(field);
        }
      }
    });

    if (primaryKeys.length !== 0) {
      this.primaryKey.push(',');
      this.primaryKey.push(`\nCONSTRAINT ${this.tableClass.tableName()}_${primaryKeys[0].getColumnName()}`);
      this.primaryKey.push(' PRIMARY KEY(');

      for (let i = 0; i < primaryKeys.length; i += 1) {
        const column: Column<any> = primaryKeys[i];
        this.primaryKey.push(column.getColumnName());

        if (i !== primaryKeys.length - 1) {
          this.primaryKey.push(',');
        }
      }
      this.primaryKey.push(')');
    }

    if (uniqueKeys.length !== 0) {
      const columnName: string = uniqueKeys[0].getColumnName();
      this.uniqueKey.push(',');
      this.uniqueKey.push(`\nCONSTRAINT ${this.tableClass.tableName()}_${columnName}`);
      this.uniqueKey.push(' UNIQUE(');

      for (let i = 0; i < uniqueKeys.length; i += 1) {
        const column: Column<any> = uniqueKeys[i];
        this.uniqueKey.push(column.getColumnName());

        if (i !== uniqueKeys.length - 1) {
          this.uniqueKey.push(',');
        }
      }
      this.uniqueKey.push(')');
    }

    return `${this.enumBuilder.join('')} ${this.tableBuilder.join('') + this.columnsBuilder.join('') + this.primaryKey.join('') + this.uniqueKey.join('')});`;
  };
}
