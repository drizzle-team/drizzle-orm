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

  public static generateAllVarcharsTableObject = () => {
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

  public static createAllVarcharsTableObjects = (number: number) => {
    const result = [];
    for (let i = 0; i < number; i += 1) {
      const object = this.generateAllVarcharsTableObject();
      result.push(object);
    }
    return result;
  };
}
export default AllVarcharUtils;
