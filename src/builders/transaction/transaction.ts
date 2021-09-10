import Session from '../../db/session';

export default class Transaction {
  public constructor(private session: Session) {
  }

  public begin = async (): Promise<Transaction> => {
    await this.session.execute('BEGIN;');
    return this;
  };

  public commit = async (): Promise<Transaction> => {
    await this.session.execute('COMMIT;');
    return this;
  };

  public rollback = async (): Promise<Transaction> => {
    await this.session.execute('ROLLBACK;');
    return this;
  };
}
