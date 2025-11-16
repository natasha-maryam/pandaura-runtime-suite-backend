const { initializeDatabase, db } = require('./init-db');
const LogicModel = require('../models/logicModel');
const TagModel = require('../models/tagModel');
const path = require('path');
const fs = require('fs');

async function setupDemoData() {
  console.log('🎬 Setting up demo data for Milestone 2...');
  
  try {
    // Initialize database
    await initializeDatabase();
    
    const logicModel = new LogicModel(db);
    const tagModel = new TagModel(db);
    
    // Clear existing data
    console.log('📝 Clearing existing data...');
    await db('logic_files').del();
    await db('tags').del();
    
    // Load sample logic files
    console.log('📁 Loading sample logic files...');
    const samplesDir = path.join(__dirname, '../../..', 'pandoura-main', 'public', 'sample-logic');
    
    if (fs.existsSync(samplesDir)) {
      const files = fs.readdirSync(samplesDir).filter(file => file.endsWith('.st'));
      
      for (const file of files) {
        const filePath = path.join(samplesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        await logicModel.create({
          name: file,
          content,
          vendor: 'neutral',
          author: 'Demo System'
        });
        
        console.log(`  ✓ Loaded ${file}`);
      }
    }
    
    // Create demo tags
    console.log('🏷️  Creating demo tags...');
    const demoTags = [
      {
        name: 'Tank_Level',
        type: 'REAL',
        value: 50.0,
        address: 'DB1.DBD0',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'Tank level in percentage (0-100%)',
          units: '%'
        }
      },
      {
        name: 'Temperature_PV',
        type: 'REAL', 
        value: 72.5,
        address: 'DB1.DBD4',
        persist: true,
        source: 'live',
        metadata: {
          description: 'Process temperature measurement',
          units: '°C'
        }
      },
      {
        name: 'Temperature_SP',
        type: 'REAL',
        value: 75.0,
        address: 'DB1.DBD8',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'Temperature setpoint',
          units: '°C'
        }
      },
      {
        name: 'Pump_Run',
        type: 'BOOL',
        value: false,
        address: 'DB1.DBX12.0',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'Pump motor control signal'
        }
      },
      {
        name: 'Emergency_Stop',
        type: 'BOOL',
        value: false,
        address: 'DB1.DBX12.1',
        persist: true,
        source: 'live',
        metadata: {
          description: 'Emergency stop button status'
        }
      },
      {
        name: 'Heater_Output',
        type: 'REAL',
        value: 0.0,
        address: 'DB1.DBD16',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'Heater output percentage',
          units: '%'
        }
      },
      {
        name: 'Flow_Rate',
        type: 'REAL',
        value: 23.7,
        address: 'DB1.DBD20',
        persist: true,
        source: 'live',
        metadata: {
          description: 'Fluid flow rate measurement',
          units: 'L/min'
        }
      },
      {
        name: 'Pressure',
        type: 'REAL',
        value: 101.3,
        address: 'DB1.DBD24',
        persist: true,
        source: 'live',
        metadata: {
          description: 'System pressure measurement',
          units: 'kPa'
        }
      },
      {
        name: 'Pump_Motor',
        type: 'BOOL',
        value: false,
        address: 'DB1.DBX12.2',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'Pump motor status feedback'
        }
      },
      {
        name: 'Level_Low',
        type: 'BOOL',
        value: false,
        address: 'DB1.DBX12.3',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'Low level alarm'
        }
      },
      {
        name: 'Level_High',
        type: 'BOOL',
        value: false,
        address: 'DB1.DBX12.4',
        persist: true,
        source: 'shadow',
        metadata: {
          description: 'High level alarm'
        }
      }
    ];
    
    for (const tag of demoTags) {
      await tagModel.create(tag);
      console.log(`  ✓ Created tag: ${tag.name} (${tag.type})`);
    }
    
    console.log('✅ Demo data setup complete!');
    console.log('\n📋 Demo checklist:');
    console.log('  • Sample logic files loaded');
    console.log('  • Demo tags created with realistic values');
    console.log('  • Tags have proper descriptions and units');
    console.log('  • Mixed live/shadow sources for conflict demo');
    console.log('\n🎬 Ready for Milestone 2 demo video!');
    
  } catch (error) {
    console.error('❌ Failed to setup demo data:', error);
    process.exit(1);
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

// Run if called directly
if (require.main === module) {
  setupDemoData();
}

module.exports = { setupDemoData };
