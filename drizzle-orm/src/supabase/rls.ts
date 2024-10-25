import { pgRole } from '~/pg-core/roles.ts';

// These are default roles that Supabase will set up.
export const anonRole = pgRole('anon').existing();
export const authenticatedRole = pgRole('authenticated').existing();
export const serviceRole = pgRole('service_role').existing();
export const postgresRole = pgRole('postgres_role').existing();
