import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { dialects } from 'src/schemaValidator';

interface InitConfig {
	dialect: string;
	out: string;
	schema: string;
	useDotenv: boolean;
}

class SimpleInput {
	constructor(private defaultValue: string = '') {}
	
	async prompt(question: string): Promise<string> {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout
		});
		
		return new Promise((resolve) => {
			rl.question(question, (answer) => {
				rl.close();
				resolve(answer.trim() || this.defaultValue);
			});
		});
	}
}

class SimpleSelect {
	constructor(private options: string[]) {}
	
	async prompt(question: string): Promise<string> {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout
		});
		
		console.log(question);
		this.options.forEach((option, index) => {
			console.log(`  ${index + 1}. ${option}`);
		});
		
		return new Promise((resolve) => {
			rl.question('\nSelect an option (1-' + this.options.length + '): ', (answer) => {
				rl.close();
				const index = parseInt(answer.trim()) - 1;
				if (index >= 0 && index < this.options.length) {
					resolve(this.options[index]!);
				} else {
					resolve(this.options[0]!); // Default to first option
				}
			});
		});
	}
}

export async function initHandler(): Promise<void> {
	console.log(chalk.green('🚀 Welcome to Drizzle Kit!'));
	console.log(chalk.gray('Let\'s set up your project with Drizzle ORM.\n'));

	// Ask for dialect
	const dialectPrompt = new SimpleSelect([
		'postgresql',
		'mysql', 
		'sqlite',
		'turso',
		'singlestore'
	]);
	
	const dialect = await dialectPrompt.prompt(chalk.bold('Which database dialect are you using?'));

	// Ask for migrations folder
	const migrationsInput = new SimpleInput('drizzle');
	console.log(chalk.bold('\nWhere would you like to store your migrations?'));
	console.log(chalk.gray('(default: drizzle)'));
	const out = await migrationsInput.prompt('> ');

	// Ask for schema location
	const schemaInput = new SimpleInput('./src/db/schema.ts');
	console.log(chalk.bold('\nWhere is your schema file located?'));
	console.log(chalk.gray('(default: ./src/db/schema.ts)'));
	const schema = await schemaInput.prompt('> ');

	// Ask about dotenv
	const dotenvPrompt = new Select(['Yes', 'No']);
	console.log(chalk.bold('\nDo you want to use environment variables (.env)?'));
	const { index: dotenvIndex } = await renderWithTask(dotenvPrompt);
	const useDotenv = dotenvIndex === 0;

	const config: InitConfig = {
		dialect,
		out,
		schema,
		useDotenv
	};

	// Generate config file
	await generateConfigFile(config);
	
	// Update package.json
	await updatePackageJson();

	console.log('\n' + chalk.green('✅ Drizzle configuration created successfully!'));
	console.log(chalk.gray('You can now run:'));
	console.log(chalk.cyan('  drizzle-kit generate'));
	console.log(chalk.cyan('  drizzle-kit migrate'));
	console.log(chalk.cyan('  drizzle-kit studio'));
}

async function generateConfigFile(config: InitConfig): Promise<void> {
	const configContent = generateConfigContent(config);
	const configPath = 'drizzle.config.ts';
	
	writeFileSync(configPath, configContent);
	console.log(chalk.green(`\n📝 Created ${configPath}`));
}

export function generateConfigContent(config: InitConfig): string {
	const { dialect, out, schema, useDotenv } = config;
	
	let imports = `import { defineConfig } from 'drizzle-kit';\n`;
	if (useDotenv) {
		imports += `import 'dotenv/config';\n`;
	}

	let connectionConfig = '';
	
	if (dialect === 'postgresql') {
		connectionConfig = useDotenv 
			? `  url: process.env.DATABASE_URL!,`
			: `  url: 'postgresql://username:password@localhost:5432/dbname',`;
	} else if (dialect === 'mysql') {
		connectionConfig = useDotenv
			? `  url: process.env.DATABASE_URL!,`
			: `  url: 'mysql://username:password@localhost:3306/dbname',`;
	} else if (dialect === 'sqlite') {
		connectionConfig = `  url: './sqlite.db',`;
	} else if (dialect === 'turso') {
		connectionConfig = useDotenv
			? `  url: process.env.TURSO_DATABASE_URL!,\n  authToken: process.env.TURSO_AUTH_TOKEN!,`
			: `  url: 'libsql://your-database-url.turso.io',\n  authToken: 'your-auth-token',`;
	} else if (dialect === 'singlestore') {
		connectionConfig = useDotenv
			? `  url: process.env.DATABASE_URL!,`
			: `  url: 'mysql://username:password@localhost:3306/dbname',`;
	}
	// For unknown dialects, leave connectionConfig empty

	return `${imports}
export default defineConfig({
  dialect: '${dialect}',
  schema: '${schema}',
  out: '${out}',
  dbCredentials: {
${connectionConfig}
  },
});
`;
}

export async function updatePackageJson(packageJsonPath: string = 'package.json'): Promise<void> {
	
	if (!existsSync(packageJsonPath)) {
		console.log(chalk.yellow('⚠️  No package.json found. You may need to run npm init first.'));
		return;
	}

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
		
		// Check if dependencies exist
		const dependencies = packageJson.dependencies || {};
		const devDependencies = packageJson.devDependencies || {};
		
		let needsUpdate = false;
		const toAdd: { [key: string]: string } = {};
		
		// Check for drizzle-orm
		if (!dependencies['drizzle-orm'] && !devDependencies['drizzle-orm']) {
			toAdd['drizzle-orm'] = '^0.44.0';
			needsUpdate = true;
		}
		
		// Check for drizzle-kit  
		if (!dependencies['drizzle-kit'] && !devDependencies['drizzle-kit']) {
			toAdd['drizzle-kit'] = '^0.31.0';
			needsUpdate = true;
		}
		
		if (needsUpdate) {
			if (!packageJson.devDependencies) {
				packageJson.devDependencies = {};
			}
			
			Object.assign(packageJson.devDependencies, toAdd);
			
			writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
			console.log(chalk.green('📦 Updated package.json with Drizzle dependencies'));
			console.log(chalk.gray('Run npm install to install the new dependencies'));
		} else {
			console.log(chalk.green('📦 Drizzle dependencies already present in package.json'));
		}
	} catch (error) {
		console.log(chalk.yellow('⚠️  Could not update package.json automatically'));
	}
}