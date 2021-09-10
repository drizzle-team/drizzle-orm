/* eslint-disable max-classes-per-file */
export class DatabaseSelectError extends Error {
  public constructor(tableName: string, reason: Error, query: string) {
    super(` Got an error, while selecting from ${tableName}. Reason: ${reason.message}. Query to database looks like:\n${query}\n`);
  }
}

export class DatabaseDeleteError extends Error {
  public constructor(tableName: string, reason: Error, query: string) {
    super(` Got an error, while deleting from ${tableName}. Reason: ${reason.message}. Query to database looks like:\n${query}\n`);
  }
}

export class DatabaseInsertError extends Error {
  public constructor(tableName: string, reason: Error, query: string) {
    super(` Got an error, while inserting to ${tableName}. Reason: ${reason.message}. Query to database looks like:\n${query}\n`);
  }
}

export class DatabaseUpdateError extends Error {
  public constructor(tableName: string, reason: Error, query: string) {
    super(` Got an error, while updating ${tableName}. Reason: ${reason.message}. Query to database looks like:\n${query}\n`);
  }
}
