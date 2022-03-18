export default abstract class BaseLogger {
  public abstract info(msg: string): void;
  public abstract error(msg: string): void;
}
