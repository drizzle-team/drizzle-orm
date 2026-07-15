/**
 * Test for MySQL binary/varbinary Buffer type fix
 * Issue: #1188 - binary/varbinary types incorrectly typed as strings instead of buffers
 */

import { describe, it, expect } from 'vitest';
import { MySqlBinary, MySqlVarBinary, binary } from '~/mysql-core/columns/binary';
import { MySqlVarBinary as VarBinary, varbinary } from '~/mysql-core/columns/varbinary';

describe('MySQL binary/varbinary types', () => {
  describe('MySqlBinary.mapFromDriverValue', () => {
    it('should return Buffer when input is Buffer', () => {
      // Mock binary column
      const binary = new MySqlBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlBinary',
      } as any);

      const inputBuffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const result = binary.mapFromDriverValue(inputBuffer);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.equals(inputBuffer)).toBe(true);
    });

    it('should return Buffer when input is string', () => {
      const binary = new MySqlBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlBinary',
      } as any);

      const inputString = 'Hello';
      const result = binary.mapFromDriverValue(inputString);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('Hello');
    });

    it('should return Buffer when input is Uint8Array', () => {
      const binary = new MySqlBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlBinary',
      } as any);

      const inputArray = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = binary.mapFromDriverValue(inputArray);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('Hello');
    });

    it('should throw error for invalid input', () => {
      const binary = new MySqlBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlBinary',
      } as any);

      expect(() => binary.mapFromDriverValue(123 as any)).toThrow('Invalid value for binary column');
    });
  });

  describe('MySqlVarBinary.mapFromDriverValue', () => {
    it('should return Buffer when input is Buffer', () => {
      const varbinary = new VarBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlVarBinary',
        length: 255,
      } as any);

      const inputBuffer = Buffer.from([0x57, 0x6f, 0x72, 0x6c, 0x64]); // "World"
      const result = varbinary.mapFromDriverValue(inputBuffer);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.equals(inputBuffer)).toBe(true);
    });

    it('should return Buffer when input is string', () => {
      const varbinary = new VarBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlVarBinary',
        length: 255,
      } as any);

      const inputString = 'World';
      const result = varbinary.mapFromDriverValue(inputString);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('World');
    });

    it('should return Buffer when input is Uint8Array', () => {
      const varbinary = new VarBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlVarBinary',
        length: 255,
      } as any);

      const inputArray = new Uint8Array([87, 111, 114, 108, 100]); // "World"
      const result = varbinary.mapFromDriverValue(inputArray);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('World');
    });

    it('should throw error for invalid input', () => {
      const varbinary = new VarBinary<any>({} as any, {
        name: 'test',
        dataType: 'buffer',
        columnType: 'MySqlVarBinary',
        length: 255,
      } as any);

      expect(() => varbinary.mapFromDriverValue(456 as any)).toThrow('Invalid value for varbinary column');
    });
  });
});
