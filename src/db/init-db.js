const knex = require('knex');
const path = require('path');

const environment = process.env.NODE_ENV || 'development';

const config = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, '../../data/pandaura-dev.sqlite3')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, './migrations')
    },
    seeds: {
      directory: path.join(__dirname, './seeds')
    }
  },
  
  production: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, '../../data/pandaura-prod.sqlite3')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, './migrations')
    },
    seeds: {
      directory: path.join(__dirname, './seeds')
    }
  }
};

const db = knex(config[environment]);

// Initialize database and run migrations
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    // Run migrations
    await db.migrate.latest();
    console.log('✅ Database migrations completed successfully');
    
    // Check if we need to seed data
    const fileCount = await db('logic_files').count('id as count').first();
    if (fileCount.count === 0) {
      await db.seed.run();
      console.log('✅ Database seeded with initial data');
    } else {
      console.log('📊 Database already contains data, skipping seed');
    }
    
    console.log(`📁 Database location: ${config[environment].connection.filename}`);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

module.exports = { db, initializeDatabase };
