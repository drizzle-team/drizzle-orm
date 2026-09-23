import { describe, expect, test } from 'vitest';
import { mapResultRow } from '../query';

// Helper to simulate the shape of a row returned by the query builder.
// The keys use the dot‑notation that the ORM uses for nested selections.
function makeRow(
  name: string,
  slug: string,
  logo: string | null,
  panelBackground: string | null,
) {
  return {
    name,
    slug,
    'branding.logo': logo,
    'branding.panelBackground': panelBackground,
  };
}

describe('Nested partial select mapping', () => {
  test('should keep nested object when first column is null but later column has value', () => {
    const row = makeRow('Test org 2', 'test-org-2', null, '#1a8cff');

    const mapped = mapResultRow(row);

    expect(mapped).toEqual({
      name: 'Test org 2',
      slug: 'test-org-2',
      branding: {
        logo: null,
        panelBackground: '#1a8cff',
      },
    });
  });

  test('should return null nested object when all nested columns are null', () => {
    const row = makeRow('Org', 'org', null, null);

    const mapped = mapResultRow(row);

    // The ORM historically collapses fully‑null nested objects to `null`.
    // This behaviour is retained.
    expect(mapped).toEqual({
      name: 'Org',
      slug: 'org',
      branding: null,
    });
  });
});
