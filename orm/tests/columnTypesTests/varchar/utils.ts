import { AllVarcharsFixedLengthModel } from './to/allVarcharsFixedLengthTable';
import { AllVarcharsTableModel } from './to/allVarcharsTable';

class AllVarcharUtils {
  public static generateString = (length: number) => {
    const characters = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$%^&*()_-+= §/|<>;${'`'},${"'"}`;

    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i += 1) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
  };

  public static createAllVarcharsTableObject = () => {
    const object: AllVarcharsTableModel = {
      primaryVarchar: this.generateString(6),
      notNullUniqueVarchar: this.generateString(9),
      notNullVarchar: this.generateString(3),
      varcharWithDefault: this.generateString(7),
      simpleVarchar: this.generateString(7),
      notNullVarcharWithDefault: this.generateString(7),
      uniqueVarchar: this.generateString(7),
    };
    return object;
  };

  public static createAllVarcharsTableFixedLengthObject = () => {
    const object: AllVarcharsFixedLengthModel = {
      primaryVarcharLength: this.generateString(10),
      notNullUniqueVarcharLength: this.generateString(10),
      notNullVarcharLength: this.generateString(10),
      varcharWithDefaultLength: this.generateString(10),
      simpleVarcharLength: this.generateString(10),
      notNullVarcharWithDefaultLength: this.generateString(10),
      uniqueVarcharLength: this.generateString(10),
    };
    return object;
  };

  public static createAllVarcharsFixedLengthTableObjects = (number: number) => {
    const result = [];
    for (let i = 0; i < number; i += 1) {
      const object = this.createAllVarcharsTableFixedLengthObject();
      result.push(object);
    }
    return result;
  };

  public static createAllVarcharsTableObjects = (number: number) => {
    const result = [];
    for (let i = 0; i < number; i += 1) {
      const object = this.createAllVarcharsTableObject();
      result.push(object);
    }
    return result;
  };
}
export default AllVarcharUtils;
