import { ValidateIndex } from '.';
import { ValidateEnum } from './enum';
import { ValidateForeignKey } from './foreign-key';
import { ValidateSequence } from './sequence';
import { ValidateTable } from './table';
import { Enum, getCollisions, listStr, MaterializedView, Sequence, Table, View } from './utils';

export class ValidateSchema {
  constructor(private errors: string[], private schema: string | undefined) {}

  validateEnum(enumName: string) {
    return new ValidateEnum(this.errors, this.schema, enumName);
  }

  validateSequence(sequenceName: string) {
    return new ValidateSequence(this.errors, this.schema, sequenceName);
  }

  validateTable(tableName: string) {
    return new ValidateTable(this.errors, this.schema, tableName);
  }

  validateForeignKey(foreignKeyName: string) {
    return new ValidateForeignKey(this.errors, this.schema, foreignKeyName);
  }

  validateIndex(indexName: string) {
    return new ValidateIndex(this.errors, this.schema, indexName);
  }

  entityNameCollisions(
    tables: Pick<Table, 'name'>[],
    views: View[],
    materializedViews: MaterializedView[],
    enums: Enum[],
    sequences: Sequence[],
  ) {
    const names = [
      ...tables.map((t) => t.name),
      ...views.map((v) => v.name),
      ...materializedViews.map((mv) => mv.name),
      ...enums.map((e) => e.enumName),
      ...sequences.filter((s) => !!s.seqName).map((s) => s.seqName) as string[],
    ];

    const collisions = getCollisions(names);
    const messages = collisions.map((name) => {
      const inTables = tables.filter((t) => t.name === name).length;
      const inViews = views.filter((v) => v.name === name).length;
      const inMaterializedViews = materializedViews.filter((mv) => mv.name === name).length;
      const inEnums = enums.filter((e) => e.enumName === name).length;
      const inSequences = sequences.filter((s) => s.seqName === name).length;

      const list = listStr(
        [inTables, 'table', 'tables'],
        [inViews, 'view', 'views'],
        [inMaterializedViews, 'materialized view', 'materialized views'],
        [inEnums, 'enum', 'enums'],
        [inSequences, 'sequence', 'sequences'],
      );

      return `${this.schema ? `In schema "${this.schema}", ` : ''}${list} have the same name, "${name}"`;
    });

    this.errors.push(...messages);
    return this;
  }

  constraintNameCollisions(
    indexes: Table['indexes'],
    foreignKeys: Table['foreignKeys'],
    checks: Table['checks'],
    primaryKeys: Table['primaryKeys'],
    uniqueConstraints: Table['uniqueConstraints'],
  ) {
    const names = [
      ...indexes.map((i) => i.name),
      ...foreignKeys.map((f) => f.name),
      ...checks.map((c) => c.name),
      ...primaryKeys.map((p) => p.name),
      ...uniqueConstraints.map((u) => u.name),
    ];

    const collisions = getCollisions(names);
    const messages = collisions.map((name) => {
      const inIndexes = indexes.filter((i) => i.name === name).length;
      const inForeignKeys = foreignKeys.filter((f) => f.name === name).length;
      const inChecks = checks.filter((c) => c.name === name).length;
      const inPrimaryKeys = primaryKeys.filter((p) => p.name === name).length;
      const inUniqueConstraints = uniqueConstraints.filter((u) => u.name === name).length;

      const list = listStr(
        [inIndexes, 'index', 'indexes'],
        [inForeignKeys, 'foreign key', 'foreign keys'],
        [inChecks, 'check', 'checks'],
        [inPrimaryKeys, 'primary key', 'primary keys'],
        [inUniqueConstraints, 'unique constraint', 'unique constraints'],
      );

      return `${this.schema ? `In schema "${this.schema}", ` : ''}${list} have the same name, "${name}"`;
    });

    this.errors.push(...messages);
    return this;
  }
}