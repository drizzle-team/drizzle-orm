import 'dotenv/config';
import { drizzle } from 'drizzle-orm/singlestore';
import * as mysql2 from 'mysql2/promise';

import * as schema from './singlestoreSchema.ts';
import { seed } from '../../src/index.ts';

// Function to get a SingleStore client
const getSingleStoreClient = async () => {
  const connectionString = process.env['SINGLESTORE_CONNECTION_STRING'] ?? 
    'singlestore://root:singlestore@localhost:3306/drizzle';
  
  console.log('Connecting to SingleStore with connection string:', connectionString);
  
  try {
    const client = await mysql2.createConnection({ 
      uri: connectionString, 
      supportBigNumbers: true,
      // Set shorter timeout for local dev
      connectTimeout: 5000,
    });
    
    await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
    await client.changeUser({ database: 'drizzle' });
    
    return client;
  } catch (error) {
    console.error('Error connecting to SingleStore:', error);
    throw error;
  }
}

// IIFE to execute the main code
(async () => {
  try {
    // Connect to SingleStore
    console.log('Attempting to connect to SingleStore...');
    const client = await getSingleStoreClient();
    const db = drizzle(client);

  console.log('SingleStore database connection was established successfully.');

  // Create schema for Northwind demo
  await createSingleStoreSchema(db);
  console.log('SingleStore tables were created.');

  // For serious migrations, use the migrator
  // await migrate(db, { migrationsFolder: path.join(__dirname, '../../../singlestoreMigrations') });
  // console.log('SingleStore database was migrated.');

  // Define seed data parameters
  const titlesOfCourtesy = ['Ms.', 'Mrs.', 'Dr.'];
  const unitsOnOrders = [0, 10, 20, 30, 50, 60, 70, 80, 100];
  const reorderLevels = [0, 5, 10, 15, 20, 25, 30];
  const quantityPerUnit = [
    '100 - 100 g pieces',
    '100 - 250 g bags',
    '10 - 200 g glasses',
    '10 - 4 oz boxes',
    '10 - 500 g pkgs.',
    '10 - 500 g pkgs.',
    '10 boxes x 12 pieces',
    '10 boxes x 20 bags',
    '10 boxes x 8 pieces',
    '10 kg pkg.',
    '10 pkgs.',
    '12 - 100 g bars',
    '12 - 100 g pkgs',
    '12 - 12 oz cans',
    '12 - 1 lb pkgs.',
    '12 - 200 ml jars',
    '12 - 250 g pkgs.',
    '12 - 355 ml cans',
    '12 - 500 g pkgs.',
    '750 cc per bottle',
    '5 kg pkg.',
    '50 bags x 30 sausgs.',
    '500 ml',
    '500 g',
    '48 pieces',
    '48 - 6 oz jars',
    '4 - 450 g glasses',
    '36 boxes',
    '32 - 8 oz bottles',
    '32 - 500 g boxes',
  ];
  const discounts = [0.05, 0.15, 0.2, 0.25];

  // Need to cast SingleStore database to MySQL database type for compatibility with seed function
  // This is because SingleStore adapter is compatible with MySQL but has a different type
  const castDb = db as unknown as any;

  // Use seed function to generate data
  await seed(castDb, schema).refine((funcs) => ({
    customers: {
      count: 10000,
      columns: {
        companyName: funcs.companyName({}),
        contactName: funcs.fullName({}),
        contactTitle: funcs.jobTitle({}),
        address: funcs.streetAddress({}),
        city: funcs.city({}),
        postalCode: funcs.postcode({}),
        region: funcs.state({}),
        country: funcs.country({}),
        phone: funcs.phoneNumber({ template: '(###) ###-####' }),
        fax: funcs.phoneNumber({ template: '(###) ###-####' }),
      },
    },
    employees: {
      count: 200,
      columns: {
        firstName: funcs.firstName({}),
        lastName: funcs.lastName({}),
        title: funcs.jobTitle({}),
        titleOfCourtesy: funcs.valuesFromArray({ values: titlesOfCourtesy }),
        birthDate: funcs.date({ minDate: '1990-01-01', maxDate: '2010-12-31' }),
        hireDate: funcs.date({ minDate: '2010-12-31', maxDate: '2024-08-26' }),
        address: funcs.streetAddress({}),
        city: funcs.city({}),
        postalCode: funcs.postcode({}),
        country: funcs.country({}),
        homePhone: funcs.phoneNumber({ template: '(###) ###-####' }),
        extension: funcs.int({ minValue: 428, maxValue: 5467 }),
        notes: funcs.loremIpsum({}),
      },
    },
    orders: {
      count: 50000,
      columns: {
        shipVia: funcs.int({ minValue: 1, maxValue: 3 }),
        freight: funcs.number({ minValue: 0, maxValue: 1000, precision: 100 }),
        shipName: funcs.streetAddress({}),
        shipCity: funcs.city({}),
        shipRegion: funcs.state({}),
        shipPostalCode: funcs.postcode({}),
        shipCountry: funcs.country({}),
      },
      with: {
        details: [
          { weight: 0.6, count: [1, 2, 3, 4] },
          { weight: 0.2, count: [5, 6, 7, 8, 9, 10] },
          { weight: 0.15, count: [11, 12, 13, 14, 15, 16, 17] },
          { weight: 0.05, count: [18, 19, 20, 21, 22, 23, 24, 25] },
        ],
      },
    },
    suppliers: {
      count: 1000,
      columns: {
        companyName: funcs.companyName({}),
        contactName: funcs.fullName({}),
        contactTitle: funcs.jobTitle({}),
        address: funcs.streetAddress({}),
        city: funcs.city({}),
        postalCode: funcs.postcode({}),
        region: funcs.state({}),
        country: funcs.country({}),
        phone: funcs.phoneNumber({ template: '(###) ###-####' }),
      },
    },
    products: {
      count: 5000,
      columns: {
        name: funcs.companyName({}),
        quantityPerUnit: funcs.valuesFromArray({ values: quantityPerUnit }),
        unitPrice: funcs.weightedRandom(
          [
            {
              weight: 0.5,
              value: funcs.int({ minValue: 3, maxValue: 300 }),
            },
            {
              weight: 0.5,
              value: funcs.number({ minValue: 3, maxValue: 300, precision: 100 }),
            },
          ],
        ),
        unitsInStock: funcs.int({ minValue: 0, maxValue: 125 }),
        unitsOnOrder: funcs.valuesFromArray({ values: unitsOnOrders }),
        reorderLevel: funcs.valuesFromArray({ values: reorderLevels }),
        discontinued: funcs.int({ minValue: 0, maxValue: 1 }),
      },
    },
    details: {
      columns: {
        unitPrice: funcs.number({ minValue: 10, maxValue: 130 }),
        quantity: funcs.int({ minValue: 1, maxValue: 130 }),
        discount: funcs.weightedRandom(
          [
            { weight: 0.5, value: funcs.valuesFromArray({ values: discounts }) },
            { weight: 0.5, value: funcs.default({ defaultValue: 0 }) },
          ],
        ),
      },
    },
    // SingleStore-specific table with vector embeddings
    documentEmbeddings: {
      count: 500,
      columns: {
        title: funcs.companyName({}),
        content: funcs.loremIpsum({ sentencesCount: 10 }),
        // Use default with array of random numbers for embedding
        embedding: funcs.default({
          defaultValue: Array.from({ length: 1536 }, () => Math.random() - 0.5),
        }),
      },
    },
  }));

    console.log('Seed completed successfully.');
    await client.end();
  } catch (error) {
    console.error('An error occurred:', error);
    console.log('\nNOTE: This script requires a running SingleStore instance.');
    console.log('You can set up SingleStore using the following approaches:');
    console.log('1. SingleStore free tier cloud database at: https://www.singlestore.com/cloud-trial/');
    console.log('2. Local Docker container: docker run -p 3306:3306 --name singlestore -e LICENSE_KEY=your_license_key -e ROOT_PASSWORD=singlestore singlestore/cluster');
    console.log('\nThen set your environment variables:');
    console.log('export SINGLESTORE_HOST=your_host');
    console.log('export SINGLESTORE_PORT=your_port');
    console.log('export SINGLESTORE_USER=your_username');
    console.log('export SINGLESTORE_PASSWORD=your_password');
    process.exit(1);
  }
})();

// Function to create the necessary tables
async function createSingleStoreSchema(db: any): Promise<void> {
  // Drop existing tables if they exist
  try {
    await db.execute(`DROP TABLE IF EXISTS order_detail;`);
    await db.execute(`DROP TABLE IF EXISTS product;`);
    await db.execute(`DROP TABLE IF EXISTS order;`);
    await db.execute(`DROP TABLE IF EXISTS employee;`);
    await db.execute(`DROP TABLE IF EXISTS customer;`);
    await db.execute(`DROP TABLE IF EXISTS supplier;`);
    await db.execute(`DROP TABLE IF EXISTS document_embedding;`);
  } catch (e) {
    console.error('Error dropping tables:', e);
  }

  // Create tables
  await db.execute(`
    CREATE TABLE customer (
      id VARCHAR(256) NOT NULL,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_title TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      postal_code TEXT,
      region TEXT,
      country TEXT NOT NULL,
      phone TEXT NOT NULL,
      fax TEXT,
      PRIMARY KEY(id)
    );
  `);

  await db.execute(`
    CREATE TABLE employee (
      id INT NOT NULL AUTO_INCREMENT,
      last_name TEXT NOT NULL,
      first_name TEXT,
      title TEXT NOT NULL,
      title_of_courtesy TEXT NOT NULL,
      birth_date TIMESTAMP NOT NULL,
      hire_date TIMESTAMP NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL,
      home_phone TEXT NOT NULL,
      extension INT NOT NULL,
      notes TEXT NOT NULL,
      reports_to INT,
      photo_path TEXT,
      PRIMARY KEY(id)
    );
  `);

  await db.execute(`
    CREATE TABLE \`order\` (
      id INT NOT NULL AUTO_INCREMENT,
      order_date TIMESTAMP NOT NULL,
      required_date TIMESTAMP NOT NULL,
      shipped_date TIMESTAMP,
      ship_via INT NOT NULL,
      freight FLOAT NOT NULL,
      ship_name TEXT NOT NULL,
      ship_city TEXT NOT NULL,
      ship_region TEXT,
      ship_postal_code TEXT,
      ship_country TEXT NOT NULL,
      customer_id VARCHAR(256) NOT NULL,
      employee_id INT NOT NULL,
      PRIMARY KEY(id)
    );
  `);

  await db.execute(`
    CREATE TABLE supplier (
      id INT NOT NULL AUTO_INCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_title TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      region TEXT,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL,
      phone TEXT NOT NULL,
      PRIMARY KEY(id)
    );
  `);

  await db.execute(`
    CREATE TABLE product (
      id INT NOT NULL AUTO_INCREMENT,
      name TEXT NOT NULL,
      quantity_per_unit TEXT NOT NULL,
      unit_price FLOAT NOT NULL,
      units_in_stock INT NOT NULL,
      units_on_order INT NOT NULL,
      reorder_level INT NOT NULL,
      discontinued INT NOT NULL,
      supplier_id INT NOT NULL,
      PRIMARY KEY(id)
    );
  `);

  await db.execute(`
    CREATE TABLE order_detail (
      unit_price FLOAT NOT NULL,
      quantity INT NOT NULL,
      discount FLOAT NOT NULL,
      order_id INT NOT NULL,
      product_id INT NOT NULL
    );
  `);

  // SingleStore-specific table with vector support
  await db.execute(`
    CREATE TABLE document_embedding (
      id INT NOT NULL AUTO_INCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding VECTOR(1536),
      PRIMARY KEY(id)
    );
  `);
}
