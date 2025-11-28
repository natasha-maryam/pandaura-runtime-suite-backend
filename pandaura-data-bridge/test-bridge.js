#!/usr/bin/env node

// Simple test script to verify Data Bridge functionality
const WebSocket = require('ws');
const axios = require('axios');

async function testDataBridge() {
    console.log('🧪 Testing Data Bridge functionality...\n');
    
    try {
        // Test HTTP health endpoint
        console.log('1️⃣  Testing HTTP health endpoint...');
        const healthResponse = await axios.get('http://localhost:3001/health', { timeout: 5000 });
        console.log('✅ Health check:', healthResponse.data);
        
        // Test WebSocket connection
        console.log('\n2️⃣  Testing WebSocket connection...');
        const ws = new WebSocket('ws://localhost:3002');
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected successfully');
            
            // Test subscription
            ws.send(JSON.stringify({
                type: 'subscribe',
                variables: ['Temp_Sensor', 'Tank_Level']
            }));
            
            console.log('📡 Subscribed to demo variables');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                if (message.type === 'variableUpdate') {
                    console.log(`📊 ${message.variable}: ${message.value}`);
                } else {
                    console.log('📨 Message:', message);
                }
            } catch (error) {
                console.log('📨 Raw message:', data.toString());
            }
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });
        
        // Keep test running for 10 seconds to see demo data
        setTimeout(() => {
            ws.close();
            console.log('\n🎯 Data Bridge test complete - ready for video recording!');
            process.exit(0);
        }, 10000);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\n💡 Make sure Data Bridge is running: node src/index.js');
        process.exit(1);
    }
}

testDataBridge();