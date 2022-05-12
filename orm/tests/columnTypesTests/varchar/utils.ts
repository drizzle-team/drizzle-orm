import { AllVarcharsTableModel } from './to/allVarcharsTable';

class AllVarcharUtils {
  public static generateString = (length: number) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    let result = ' ';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i += 1) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
  };

  public static createAllVarcharsTableModels = (number: number) => {
    const result = [];
    for (let i = 0; i < number; i += 1) {
      const object: AllVarcharsTableModel = {
        primaryVarchar: this.generateString(6),
        notNullUniqueVarchar: this.generateString(9),
        notNullVarchar: this.generateString(3),
        varcharWithDefault: this.generateString(7),
        simpleVarchar: this.generateString(7),
        notNullVarcharWithDefault: this.generateString(7),
        uniqueVarchar: this.generateString(7),
      };
      result.push(object);
    }
    return result;
  };
  //   public static getMonthDifference = (from: Moment, to: Moment) => (
  //     to.month() - from.month() + 12 * (to.year() - from.year()));

//   public static generateId = () => crypto.randomBytes(20).toString('hex');
}
export default AllVarcharUtils;
