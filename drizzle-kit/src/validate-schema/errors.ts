export enum SchemaValidationErrors {
  // Database
  SchemaNameCollisions = 1,
  // Schema
  SchemaEntityNameCollisions = 2,
  SchemaConstraintNameCollisions = 3,
  // Enum
  EnumValueCollisions = 4,
  // Sequence
  SequenceIncrementByZero = 5,
  SequenceInvalidMinMax = 12,
  // Table
  TableColumnNameCollisions = 6,
  // Foreign key
  ForeignKeyMismatchingColumnCount = 7,
  ForeignKeyMismatchingDataTypes = 8,
  ForeignKeyColumnsMixingTables = 9,
  ForeignKeyForeignColumnsMixingTables = 13,
  // Primary key
  PrimaryKeyColumnsMixingTables = 14,
  // Index
  IndexRequiresName = 10,
  IndexVectorColumnRequiresOp = 11,
};
