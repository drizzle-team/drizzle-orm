import { ExtractModel } from '@/tables';
import AllVarcharsFixedLengthTable from './to/allVarcharsFixedLengthTable';
import AllVarcharsTable, { AllVarcharsTableModel } from './to/allVarcharsTable';

export const allPositiveFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'lunaxodd@gmail.com',
  simpleVarchar: 'Oleksii`s MacBook',
  notNullVarchar: 'owner',
  varcharWithDefault: 'EN',
  notNullVarcharWithDefault: 'MacBook M1',
  uniqueVarchar: 'C02FL29VQ6LR',
  notNullUniqueVarchar: 'CNNioew',
};

export const requiredFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'exAmple2@gmail.com',
  notNullVarchar: 'Oleksii',
  varcharWithDefault: undefined,
  notNullVarcharWithDefault: 'undefined',
  uniqueVarchar: 'unique_varchar',
  notNullUniqueVarchar: 'KEYFJLL',
};

export const allPositiveFieldsLength: ExtractModel<AllVarcharsFixedLengthTable> = {
  primaryVarcharLength: '1',
  simpleVarcharLength: 'Oleksiis MacBook',
  notNullVarcharLength: 'owner',
  varcharWithDefaultLength: 'EN',
  notNullVarcharWithDefaultLength: 'MacBook M1',
  uniqueVarcharLength: 'C02FL29VQ6LR',
  notNullUniqueVarcharLength: 'CNNioeniosdsdw',
};

export const requiredFieldsLength: ExtractModel<AllVarcharsFixedLengthTable> = {
  primaryVarcharLength: '1',
  simpleVarcharLength: 'Oleksii`s MacBook',
  notNullVarcharLength: 'owner',
  varcharWithDefaultLength: undefined,
  notNullVarcharWithDefaultLength: 'MacBook M1',
  uniqueVarcharLength: 'C02FL29V6LR',
  notNullUniqueVarcharLength: 'CNiodsew',
};
