// NOTE: The provided option-value completions can be customized or removed as needed.
// NOTE: Descriptions and flags based on drizzle-kit documentation.

import t from '@bomb.sh/tab';
import { command, string } from '@drizzle-team/brocli';

// Setup completion definitions
function setupCompletions() {
    // Root level commands
    const generate = t.command('generate', 'Generate migration files');
    const migrate = t.command('migrate', 'Apply migrations to database');
    const push = t.command('push', 'Push schema changes to database');
    const pull = t.command('pull', 'Pull schema from database (introspect)');
    const introspect = t.command('introspect', 'Pull schema from database');
    const check = t.command('check', 'Check migration files consistency');
    const up = t.command('up', 'Update snapshot format for migration files');
    const drop = t.command('drop', 'Drop migration');
    const studio = t.command('studio', 'Start Drizzle Studio');
    const exportCmd = t.command('export', 'Generate diff as SQL');

    // Dialect option completions
    const dialectHandler = (complete: (value: string, description: string) => void): void => {
        complete('postgresql', 'PostgreSQL database');
        complete('mysql', 'MySQL database');
        complete('sqlite', 'SQLite database');
        complete('turso', 'Turso/LibSQL database');
        complete('singlestore', 'SingleStore database');
        complete('gel', 'Gel database');
    };

    // Driver option completions
    const driverHandler = (complete: (value: string, description: string) => void): void => {
        complete('aws-data-api', 'AWS Data API');
        complete('pglite', 'PGlite');
    };

    // Casing option completions
    const casingHandler = (complete: (value: string, description: string) => void): void => {
        complete('camelCase', 'Use camelCase');
        complete('snake_case', 'Use snake_case');
    };

    // Prefix option completions
    const prefixHandler = (complete: (value: string, description: string) => void): void => {
        complete('index', 'Use index prefix');
        complete('timestamp', 'Use timestamp prefix');
        complete('supabase', 'Use supabase prefix');
        complete('unix', 'Use unix prefix');
        complete('none', 'No prefix');
    };

    // URL completions for common databases
    const urlHandler = (complete: (value: string, description: string) => void): void => {
        complete('postgresql://', 'PostgreSQL connection string');
        complete('mysql://', 'MySQL connection string');
        complete('file:', 'SQLite file path');
        complete('libsql://', 'LibSQL/Turso connection string');
    };

    // Port completions
    const portHandler = (complete: (value: string, description: string) => void): void => {
        complete('5432', 'PostgreSQL default port');
        complete('3306', 'MySQL default port');
        complete('3307', 'SingleStore default port');
    };

    // Studio port completions
    const studioPortHandler = (complete: (value: string, description: string) => void): void => {
        complete('4983', 'Default Studio port');
        complete('3000', 'Alternative port');
        complete('8080', 'Alternative port');
    };

    // SSL mode completions
    const sslHandler = (complete: (value: string, description: string) => void): void => {
        complete('require', 'Require SSL');
        complete('prefer', 'Prefer SSL');
        complete('allow', 'Allow SSL');
        complete('disable', 'Disable SSL');
    };

    // generate command options
    generate.option('config', 'Path to drizzle config file');
    generate.option('dialect', 'Database dialect', dialectHandler);
    generate.option('driver', 'Database driver', driverHandler);
    generate.option('casing', 'Casing for serialization', casingHandler);
    generate.option('schema', 'Path to schema file or folder');
    generate.option('out', 'Output folder for migrations');
    generate.option('name', 'Migration file name');
    generate.option('breakpoints', 'Prepare SQL statements with breakpoints');
    generate.option('custom', 'Prepare empty migration file for custom SQL');
    generate.option('prefix', 'Migration file prefix', prefixHandler);

    // migrate command options
    migrate.option('config', 'Path to drizzle config file');

    // push command options
    push.option('config', 'Path to drizzle config file');
    push.option('dialect', 'Database dialect', dialectHandler);
    push.option('casing', 'Casing for serialization', casingHandler);
    push.option('schema', 'Path to schema file or folder');
    push.option('tablesFilter', 'Table name filters');
    push.option('schemaFilters', 'Schema name filters');
    push.option('extensionsFilters', 'Database extensions filters');
    push.option('url', 'Database connection URL', urlHandler);
    push.option('host', 'Database host');
    push.option('port', 'Database port', portHandler);
    push.option('user', 'Database user');
    push.option('password', 'Database password');
    push.option('database', 'Database name');
    push.option('ssl', 'SSL mode', sslHandler);
    push.option('auth-token', 'Database auth token (Turso)');
    push.option('driver', 'Database driver', driverHandler);
    push.option('verbose', 'Print all statements for each push');
    push.option('strict', 'Always ask for confirmation');
    push.option('force', 'Auto-approve all data loss statements');

    // pull/introspect command options
    const introspectCasingHandler = (complete: (value: string, description: string) => void): void => {
        complete('camel', 'Use camelCase');
        complete('preserve', 'Preserve original casing');
    };

    pull.option('config', 'Path to drizzle config file');
    pull.option('dialect', 'Database dialect', dialectHandler);
    pull.option('out', 'Output folder');
    pull.option('breakpoints', 'Prepare SQL statements with breakpoints');
    pull.option('introspect-casing', 'Casing for introspection', introspectCasingHandler);
    pull.option('tablesFilter', 'Table name filters');
    pull.option('schemaFilters', 'Schema name filters');
    pull.option('extensionsFilters', 'Database extensions filters');
    pull.option('url', 'Database connection URL', urlHandler);
    pull.option('host', 'Database host');
    pull.option('port', 'Database port', portHandler);
    pull.option('user', 'Database user');
    pull.option('password', 'Database password');
    pull.option('database', 'Database name');
    pull.option('ssl', 'SSL mode', sslHandler);
    pull.option('auth-token', 'Database auth token (Turso)');
    pull.option('driver', 'Database driver', driverHandler);

    // introspect command (alias for pull)
    introspect.option('config', 'Path to drizzle config file');
    introspect.option('dialect', 'Database dialect', dialectHandler);
    introspect.option('out', 'Output folder');
    introspect.option('breakpoints', 'Prepare SQL statements with breakpoints');
    introspect.option('introspect-casing', 'Casing for introspection', introspectCasingHandler);
    introspect.option('tablesFilter', 'Table name filters');
    introspect.option('schemaFilters', 'Schema name filters');
    introspect.option('extensionsFilters', 'Database extensions filters');
    introspect.option('url', 'Database connection URL', urlHandler);
    introspect.option('host', 'Database host');
    introspect.option('port', 'Database port', portHandler);
    introspect.option('user', 'Database user');
    introspect.option('password', 'Database password');
    introspect.option('database', 'Database name');
    introspect.option('ssl', 'SSL mode', sslHandler);
    introspect.option('auth-token', 'Database auth token (Turso)');
    introspect.option('driver', 'Database driver', driverHandler);

    // check command options
    check.option('config', 'Path to drizzle config file');
    check.option('dialect', 'Database dialect', dialectHandler);
    check.option('out', 'Output folder');

    // up command options
    up.option('config', 'Path to drizzle config file');
    up.option('dialect', 'Database dialect', dialectHandler);
    up.option('out', 'Output folder');

    // drop command options
    drop.option('config', 'Path to drizzle config file');
    drop.option('out', 'Output folder');
    drop.option('driver', 'Database driver', driverHandler);

    // studio command options
    studio.option('config', 'Path to drizzle config file');
    studio.option('port', 'Custom port for Drizzle Studio', studioPortHandler);
    studio.option('host', 'Custom host for Drizzle Studio');
    studio.option('verbose', 'Print all statements executed by Studio');

    // export command options
    exportCmd.option('sql', 'Generate as SQL');
    exportCmd.option('config', 'Path to drizzle config file');
    exportCmd.option('dialect', 'Database dialect', dialectHandler);
    exportCmd.option('schema', 'Path to schema file or folder');
}

// Intercept completion requests BEFORE brocli parses them
// Shell scripts call: drizzle-kit complete -- <args...>
const argv = process.argv;
if (argv.includes('complete') && argv.includes('--')) {
    const completeIndex = argv.indexOf('complete');
    const separatorIndex = argv.indexOf('--', completeIndex);
    if (separatorIndex > completeIndex) {
        // This is a completion request, handle it directly before brocli sees it
        setupCompletions();
        const completionArgs = argv.slice(separatorIndex + 1);
        t.parse(completionArgs);
        process.exit(0);
    }
}

export const completions = command({
    name: 'complete',
    hidden: true,
    options: {
        shell: string().desc('Shell type for completion setup (zsh, bash, fish, powershell)'),
    },
    handler: async (opts) => {
        const shell = opts.shell;
        if (shell && ['zsh', 'bash', 'fish', 'powershell'].includes(shell)) {
            setupCompletions();
            t.setup('drizzle-kit', 'drizzle-kit', shell);
        }
    },
});