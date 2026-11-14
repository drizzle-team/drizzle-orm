import { pgRole } from '~/pg-core/roles.ts';

pgRole('login', { canLogin: true });
pgRole('all', { canLogin: false, createDb: true, createRole: true, inherit: false });

// @ts-expect-error unknown role option
pgRole('unknown', { canLogIn: true });
