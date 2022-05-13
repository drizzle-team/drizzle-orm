import { ExtractModel } from '@/tables';
import AllVarcharsTable from './to/allVarcharsTable';

export const allPositiveFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'lunaxodd@gmail.com',
  simpleVarchar: 'Oleksii`s MacBook',
  notNullVarchar: 'owner',
  varcharWithDefault: 'EN',
  notNullVarcharWithDefault: 'MacBook M1',
  uniqueVarchar: 'C02FL29VQ6LR',
  notNullUniqueVarchar: 'CNNioew',
  simpleVarcharLength: 'Oleksiis MacBook',
  notNullVarcharLength: 'owner',
  varcharWithDefaultLength: 'EN',
  notNullVarcharWithDefaultLength: 'MacBook M1',
  uniqueVarcharLength: 'C02FL29VQ6LR',
  notNullUniqueVarcharLength: 'CNNioeniow',
};

export const mixedFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'exAmple2@gmail.com',
  notNullVarchar: 'Oleksii',
  varcharWithDefault: undefined,
  notNullVarcharWithDefault: 'undefined',
  uniqueVarchar: 'unique_varchar',
  notNullUniqueVarchar: 'KEYFJLL',
  simpleVarcharLength: 'Oleksii`s MacBook',
  notNullVarcharLength: 'owner',
  varcharWithDefaultLength: undefined,
  notNullVarcharWithDefaultLength: 'MacBook M1',
  uniqueVarcharLength: 'C02FL29V6LR',
  notNullUniqueVarcharLength: 'CNiodsew',
};
