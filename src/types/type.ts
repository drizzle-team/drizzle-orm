export default abstract class Type<TType> {
  public abstract type: object;
  protected __type: TType;

  public abstract alias(): string;
}
