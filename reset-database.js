/**
 * Database Reset Script
 * Clears all data and resets the database to a fresh state
 * Run with: node reset-database.js
 */

const knex = require('knex');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const environment = process.env.NODE_ENV || 'development';

// Ensure data directory exists before initializing knex
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
}

const config = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, 'data/pandaura-dev.sqlite3')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src/db/migrations')
    },
  },
};

const db = knex(config[environment]);

// Create readline interface for confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function resetDatabase() {
  console.log('\n⚠️  DATABASE RESET UTILITY ⚠️\n');
  console.log('This will:');
  console.log('  1. Drop all tables');
  console.log('  2. Delete all version storage files');
  console.log('  3. Run migrations to recreate tables');
  console.log('  4. Leave database empty (no seed data)\n');
  
  const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Operation cancelled\n');
    rl.close();
    process.exit(0);
  }

  try {
    console.log('\n🔄 Starting database reset...\n');

    // Step 1: Rollback all migrations
    console.log('📥 Rolling back all migrations...');
    try {
      await db.migrate.rollback(undefined, true); // true = rollback all
      console.log('✅ Migrations rolled back');
    } catch (rollbackError) {
      console.log('⚠️  No migrations to rollback (fresh start)');
    }

    // Step 2: Delete version storage directory
    const versionsPath = path.join(__dirname, 'data/versions');
    if (fs.existsSync(versionsPath)) {
      console.log('🗑️  Deleting version storage files...');
      fs.rmSync(versionsPath, { recursive: true, force: true });
      console.log('✅ Version storage deleted');
    }

    // Step 3: Delete projects directory
    const projectsPath = path.join(__dirname, 'data/projects');
    if (fs.existsSync(projectsPath)) {
      console.log('🗑️  Deleting project files...');
      fs.rmSync(projectsPath, { recursive: true, force: true });
      console.log('✅ Project files deleted');
    }

    // Step 4: Run migrations
    console.log('📤 Running migrations...');
    await db.migrate.latest();
    console.log('✅ Migrations completed');

    // Step 5: Verify tables
    console.log('\n📊 Verifying database structure...');
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tableList = tables.map(t => t.name);
    console.log(`\n✅ Database reset complete! Created ${tableList.length} tables:\n`);
    tableList.forEach(tableName => {
      console.log(`   - ${tableName}`);
    });

    console.log('\n🎉 Database is now clean and ready for testing!\n');
    console.log('Next steps:');
    console.log('  1. Start the backend server: npm start');
    console.log('  2. Create a new project in the UI');
    console.log('  3. Test the complete workflow:\n');
    console.log('     Dev → Create Version → Create Snapshot');
    console.log('     → Promote to QA → Run checks');
    console.log('     → Promote to Staging → Get approvals');
    console.log('     → Create Release → Sign Release');
    console.log('     → Deploy to Production → Monitor/Rollback\n');

  } catch (error) {
    console.error('\n❌ Error resetting database:', error.message);
    console.error(error.stack);
  } finally {
    rl.close();
    await db.destroy();
  }
}

// Run the reset
resetDatabase();
