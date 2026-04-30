// @ts-ignore - imported using Rollup json plugin
export { version as npmVersion } from '../package.json';
// In version 7, we changed the PostgreSQL indexes API
// In version 12, we changed the migration folder structure and migrate function
// In version 13, we added node-sqlite driver support in orm and kit
// In version 14, we remade casing api (db instance's config => db entity constructors)
export const compatibilityVersion = 14;
