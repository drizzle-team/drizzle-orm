import AbstractTable from '../../../tables/abstractTable';
import { FullOrPartial } from '../../../tables/inferTypes';

export default class JoinBuilderResponses<
TResponses extends FullOrPartial<AbstractTable<any>, any>[]> {
  private responsesType: TResponses;

  public constructor(private responses: TResponses[]) {
  }

  public map = <M>(imac: (...args: [...TResponses]) => M): Array<M> => {
    const objects = new Array<M>();
    for (let i = 0; i < this.responses[0].length; i += 1) {
      const responses = this.responses.map((res) => res[i]);
      objects.push(imac(...responses as [...TResponses]));
    }
    return objects;
  };
}
