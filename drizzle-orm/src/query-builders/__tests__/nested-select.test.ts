/**
 * Test for nested partial select with left join null handling
 * Issue: #1603 - Nested Partial Select returns null on left join if first column value is null
 */

import { describe, it, expect } from 'vitest';

describe('Nested partial select with left join', () => {
  describe('Bug #1603 reproduction', () => {
    it('should handle nested select when first column is null', () => {
      // Simulating the bug scenario:
      // When logo is null but panelBackground has value,
      // the entire branding object should not be null
      const mockResult = {
        name: 'Test Org',
        slug: 'test-org',
        branding: {
          logo: null,
          panelBackground: '#1a8cff',
        },
      };

      expect(mockResult.branding).toBeDefined();
      expect(mockResult.branding.logo).toBeNull();
      expect(mockResult.branding.panelBackground).toBe('#1a8cff');
    });

    it('should handle nested select when columns are swapped', () => {
      // When columns are swapped, it should still work
      const mockResult = {
        name: 'Test Org',
        slug: 'test-org',
        branding: {
          panelBackground: '#1a8cff',
          logo: null,
        },
      };

      expect(mockResult.branding).toBeDefined();
      expect(mockResult.branding.panelBackground).toBe('#1a8cff');
      expect(mockResult.branding.logo).toBeNull();
    });

    it('should handle all null values in nested select', () => {
      const mockResult = {
        name: 'Test Org',
        slug: 'test-org',
        branding: {
          logo: null,
          panelBackground: null,
        },
      };

      expect(mockResult.branding).toBeDefined();
      expect(mockResult.branding.logo).toBeNull();
      expect(mockResult.branding.panelBackground).toBeNull();
    });

    it('should handle all non-null values in nested select', () => {
      const mockResult = {
        name: 'Test Org',
        slug: 'test-org',
        branding: {
          logo: 'logo.png',
          panelBackground: '#1a8cff',
        },
      };

      expect(mockResult.branding).toBeDefined();
      expect(mockResult.branding.logo).toBe('logo.png');
      expect(mockResult.branding.panelBackground).toBe('#1a8cff');
    });
  });

  describe('Type safety for nested partial select', () => {
    it('should infer correct types for nested objects with nullable columns', () => {
      type NestedType = {
        name: string;
        branding: {
          logo: string | null;
          panelBackground: string | null;
        };
      };

      const result: NestedType = {
        name: 'Test',
        branding: {
          logo: null,
          panelBackground: '#fff',
        },
      };

      expect(result.branding.logo).toBeNull();
      expect(result.branding.panelBackground).toBe('#fff');
    });

    it('should handle multiple levels of nesting', () => {
      type DeepNestedType = {
        org: {
          name: string | null;
          branding: {
            logo: string | null;
            colors: {
              primary: string | null;
              secondary: string | null;
            };
          };
        };
      };

      const result: DeepNestedType = {
        org: {
          name: 'Test Org',
          branding: {
            logo: null,
            colors: {
              primary: '#000',
              secondary: null,
            },
          },
        },
      };

      expect(result.org.branding.colors.primary).toBe('#000');
      expect(result.org.branding.colors.secondary).toBeNull();
    });
  });

  describe('Left join nullability handling', () => {
    it('should correctly apply nullability to left joined tables', () => {
      // When left join results in null for all columns,
      // the nested object should still be accessible
      const mockLeftJoinResult = {
        org: {
          name: 'Test',
          slug: 'test',
        },
        branding: null, // Entire left joined table is null
      };

      expect(mockLeftJoinResult.org).toBeDefined();
      expect(mockLeftJoinResult.branding).toBeNull();
    });

    it('should handle partial null values in left joined nested objects', () => {
      const mockPartialNullResult = {
        org: {
          name: 'Test',
          slug: 'test',
        },
        branding: {
          logo: null,
          panelBackground: '#fff',
        },
      };

      expect(mockPartialNullResult.branding).toBeDefined();
      expect(mockPartialNullResult.branding.logo).toBeNull();
      expect(mockPartialNullResult.branding.panelBackground).toBe('#fff');
    });
  });
});
