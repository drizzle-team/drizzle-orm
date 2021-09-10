import BaseLogger from './abstractLogger';

export default class ConsoleLogger extends BaseLogger {
  public info(msg: string): void {
    console.log(`INFO: ${msg}`);
  }

  public error(msg: string): void {
    console.log(`ERROR: ${msg}`);
  }
}
