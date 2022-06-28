/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
import { PgText, PgTime, PgTimestamp } from '.';
import DB from '../db/db';
import { AbstractTable } from '../tables';
import ColumnType from './types/columnType';
import PgTimestamptz from './types/pgTimestamptz';

type PgTimes = PgTimestamptz | PgTime | PgTimestamp;

class RawSqlValue {
  public constructor(public readonly value: any, public readonly escape: boolean) {
  }

  public toJSON(): string {
    return this.escape ? `'${this.value}'` : this.value;
  }
}

export const Defaults = {
  CURRENT_TIMESTAMP: new RawSqlValue('CURRENT_TIMESTAMP', false),
};

export type ExtractColumnType<T extends ColumnType<any>> =
 T extends ColumnType<infer TCodeType> ?
   T extends PgTimes ? TCodeType : TCodeType
   : never;

export const rawValue = (value: string): RawSqlValue => new RawSqlValue(value, false);

// eslint-disable-next-line max-len
export abstract class AbstractColumn<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false, TParent extends AbstractTable<any> = any> {
  public isNullableFlag: boolean = true;
  public primaryKeyName?: string;
  public uniqueKeyName?: string;

  protected onDelete?: string;
  protected onUpdate?: string;
  protected parent: TParent;

  protected parentTableName: string;
  protected columnType: T;
  protected columnName: string;
  protected defaultParam: RawSqlValue;
  protected referenced: AbstractColumn<T, boolean, boolean>;

  public constructor(parent: TParent, columnName: string,
    columnType: T) {
    this.columnType = columnType;
    this.columnName = columnName;
    this.parentTableName = parent.tableName();
    this.parent = parent;
  }

  public getOnDelete = (): string | undefined => this.onDelete;
  public getOnUpdate = (): string | undefined => this.onUpdate;

  public getAlias = (): string => `${this.parentTableName.replace('.', '_')}_${this.columnName}`;

  public getParent = (): AbstractTable<any> => this.parent;

  public getParentName = (): string => this.parentTableName;

  public abstract foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => Column<any, boolean, boolean, ITable>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): AbstractColumn<T, TNullable, TAutoIncrement, TParent>;

  public abstract selfForeignKey(
    column: Column<any, boolean, boolean, TParent>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): AbstractColumn<T, TNullable, TAutoIncrement, TParent>;

  public defaultValue(value: ExtractColumnType<T> | RawSqlValue): AbstractColumn<T, boolean, boolean, TParent> {
    if (value instanceof RawSqlValue) {
      this.defaultParam = value as RawSqlValue;
    } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
      this.defaultParam = new RawSqlValue(value, false);
    } else {
      this.defaultParam = new RawSqlValue(`${value}`, true);
    }
    return this;
  }

  public abstract primaryKey(): AbstractColumn<T, boolean, boolean, TParent>;

  public unique = () => {
    this.uniqueKeyName = this.columnName;
    return this;
  };

  public abstract notNull(): AbstractColumn<T, boolean, boolean, TParent>;

  public getColumnName = (): string => this.columnName;

  public getReferenced = (): AbstractColumn<T, boolean, boolean, TParent> => this.referenced;

  public getColumnType = (): T => this.columnType;

  public getDefaultValue = (): RawSqlValue => this.defaultParam;
}

// eslint-disable-next-line max-len
export class Column<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false, TParent extends AbstractTable<any> = any>
  extends AbstractColumn<T, TNullable, TAutoIncrement, TParent> {
  public constructor(parent: TParent, columnName: string,
    columnType: T) {
    super(parent, columnName, columnType);
  }

  public defaultValue = (value: ExtractColumnType<T> | RawSqlValue): Column<T, true, TAutoIncrement, TParent> => {
    super.defaultValue(value);
    return this as Column<T, true, TAutoIncrement, TParent>;
  };

  public notNull(): Column<T, TAutoIncrement extends true ? true : TNullable extends true ? false : true, TAutoIncrement, TParent> {
    this.isNullableFlag = false;
    return this as Column<T, TAutoIncrement extends true ? true : TNullable extends true ? false : true, TAutoIncrement, TParent>;
  }

  public primaryKey(): Column<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent> {
    this.primaryKeyName = `${this.parentTableName}_${this.columnName}`;
    return this as Column<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent>;
  }

  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => Column<any, boolean, boolean, ITable>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): Column<T, TNullable, TAutoIncrement, TParent> {
    const tableInstance: ITable = this.getParent().db.create(table);
    this.referenced = callback(tableInstance);
    this.onDelete = onConstraint?.onDelete ? `ON DELETE ${onConstraint.onDelete}` : undefined;
    this.onUpdate = onConstraint?.onUpdate ? `ON UPDATE ${onConstraint.onUpdate}` : undefined;
    return this;
  }

  public selfForeignKey(
    column: Column<any, boolean, boolean, TParent>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): Column<T, TNullable, TAutoIncrement, TParent> {
    this.referenced = column;
    this.onDelete = onConstraint?.onDelete ? `ON DELETE ${onConstraint.onDelete}` : undefined;
    this.onUpdate = onConstraint?.onUpdate ? `ON UPDATE ${onConstraint.onUpdate}` : undefined;
    return this;
  }
}

// eslint-disable-next-line max-len
export class IndexedColumn<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false, TParent extends AbstractTable<any> = any> extends AbstractColumn<T, TNullable, TAutoIncrement, TParent> {
  public constructor(parent: TParent, columnName: string,
    columnType: T, nullable: TNullable) {
    super(parent, columnName, columnType);
  }

  public defaultValue = (value: ExtractColumnType<T> | RawSqlValue): IndexedColumn<T, true, TAutoIncrement, TParent> => {
    super.defaultValue(value);
    return this as IndexedColumn<T, true, TAutoIncrement, TParent>;
  };

  public notNull(): IndexedColumn<T, TAutoIncrement extends true ? true : TNullable extends true? false : true, TAutoIncrement, TParent> {
    this.isNullableFlag = false;
    return this as IndexedColumn<T, TAutoIncrement extends true ? true : TNullable extends true? false : true, TAutoIncrement, TParent>;
  }

  public primaryKey(): IndexedColumn<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent> {
    this.primaryKeyName = `${this.parentTableName}_${this.columnName}`;
    // eslint-disable-next-line max-len
    return this as IndexedColumn<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent>;
  }

  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => Column<any, boolean, boolean, ITable>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): IndexedColumn<T, TNullable, TAutoIncrement, TParent> {
    // eslint-disable-next-line new-cap
    this.referenced = callback(this.getParent().db.create(table));
    this.onDelete = onConstraint?.onDelete ? `ON DELETE ${onConstraint.onDelete}` : undefined;
    this.onUpdate = onConstraint?.onUpdate ? `ON UPDATE ${onConstraint.onUpdate}` : undefined;
    return this;
  }

  public selfForeignKey<ITable extends AbstractTable<ITable>>(
    column: Column<any, boolean, boolean, TParent>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): IndexedColumn<T, TNullable, TAutoIncrement, TParent> {
    this.referenced = column;
    this.onDelete = onConstraint?.onDelete ? `ON DELETE ${onConstraint.onDelete}` : undefined;
    this.onUpdate = onConstraint?.onUpdate ? `ON UPDATE ${onConstraint.onUpdate}` : undefined;
    return this;
  }
}
