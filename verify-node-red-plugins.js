#!/usr/bin/env node

// Node-RED Plugin Verification Script
const axios = require('axios');

async function verifyNodeRedPlugins() {
    console.log('🔍 Verifying PandaUra Node-RED Plugin Installation...\n');
    
    try {
        // Test Node-RED API
        const response = await axios.get('http://127.0.0.1:1880/nodes', { timeout: 5000 });
        const nodes = response.data;
        
        console.log('📊 Node-RED Node Registry Check:');
        
        // Check for our PandaUra nodes
        const pandauraNodes = [
            'pandaura-runtime-connect',
            'pandaura-scenario-generator', 
            'pandaura-fault-injector',
            'pandaura-tag-monitor'
        ];
        
        let foundNodes = 0;
        
        pandauraNodes.forEach(nodeType => {
            const found = nodes.find(node => node.id === nodeType);
            if (found) {
                console.log(`✅ ${nodeType} - Loaded`);
                foundNodes++;
            } else {
                console.log(`❌ ${nodeType} - Not Found`);
            }
        });
        
        console.log(`\n📈 Plugin Status: ${foundNodes}/${pandauraNodes.length} nodes loaded`);
        
        if (foundNodes === pandauraNodes.length) {
            console.log('🎉 All PandaUra plugins successfully installed and loaded!');
            console.log('\n🎬 Ready for thermal runaway video recording!');
        } else {
            console.log('⚠️  Some plugins missing - may need Node-RED restart');
        }
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Node-RED not accessible at http://127.0.0.1:1880');
            console.log('💡 Make sure Node-RED is running: node-red');
        } else {
            console.log('❌ Error checking plugins:', error.message);
        }
    }
}

verifyNodeRedPlugins();