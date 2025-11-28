/**
 * PandaUra Data Bridge - Multi-protocol Data Synchronization Service
 * 
 * Enables real-time data sharing between PandaUra Shadow Runtime and external tools
 * Supports WebSocket, MQTT, and CSV file-based data exchange
 */

const express = require('express');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

// Configuration
const CONFIG = {
    PORT: process.env.PORT || 3001,
    PANDAURA_HOST: process.env.PANDAURA_HOST || 'localhost:8000',
    MQTT_BROKER: process.env.MQTT_BROKER || 'disabled', // Disabled by default - optional feature
    CSV_OUTPUT_DIR: process.env.CSV_OUTPUT_DIR || './data/csv_exports',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    SYNC_INTERVAL: parseInt(process.env.SYNC_INTERVAL) || 1000
};

// Logger setup
const logger = winston.createLogger({
    level: CONFIG.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'data-bridge.log' })
    ]
});

class DataBridgeService {
    constructor() {
        this.app = express();
        this.server = null;
        this.wsServer = null;
        this.mqttClient = null;
        this.pandauraWs = null;
        
        this.connectedClients = new Set();
        this.subscriptions = new Map(); // Variable subscriptions
        this.csvWriters = new Map(); // Active CSV writers
        
        this.setupExpress();
        this.setupWebSocket();
        this.setupMQTT();
        this.connectToPandaUra();
        
        // Start demo data generator for testing (when PandaUra not connected)
        this.startDemoDataGenerator();
    }
    
    setupExpress() {
        this.app.use(express.json());
        
        // Health check
        this.app.get('/health', (req, res) => {
            const connections = {
                websocket: this.wsServer ? this.wsServer.clients.size : 0,
                mqtt: this.mqttClient ? this.mqttClient.connected : false,
                pandaura: this.pandauraWs ? this.pandauraWs.readyState === WebSocket.OPEN : false
            };
            
            const isHealthy = this.wsServer !== null; // Main service is WebSocket
            
            res.json({
                status: isHealthy ? 'healthy' : 'degraded',
                message: isHealthy ? 'Data Bridge operational' : 'Running with limited connectivity',
                connections,
                subscriptions: this.subscriptions.size,
                csvWriters: this.csvWriters.size,
                timestamp: new Date().toISOString()
            });
        });
        
        // Get active subscriptions
        this.app.get('/subscriptions', (req, res) => {
            const subscriptions = Array.from(this.subscriptions.entries()).map(([variable, clients]) => ({
                variable,
                clientCount: clients.size
            }));
            res.json({ subscriptions });
        });
        
        // Subscribe to variable
        this.app.post('/subscribe', (req, res) => {
            const { variables, clientId, protocols } = req.body;
            
            if (!variables || !Array.isArray(variables)) {
                return res.status(400).json({ error: 'Variables array is required' });
            }
            
            variables.forEach(variable => {
                if (!this.subscriptions.has(variable)) {
                    this.subscriptions.set(variable, new Set());
                }
                
                this.subscriptions.get(variable).add({
                    clientId,
                    protocols: protocols || ['websocket']
                });
            });
            
            logger.info(`Subscribed client ${clientId} to variables: ${variables.join(', ')}`);
            res.json({ success: true, subscribedVariables: variables });
        });
        
        // Unsubscribe from variable
        this.app.post('/unsubscribe', (req, res) => {
            const { variables, clientId } = req.body;
            
            if (!variables || !Array.isArray(variables)) {
                return res.status(400).json({ error: 'Variables array is required' });
            }
            
            variables.forEach(variable => {
                if (this.subscriptions.has(variable)) {
                    const clients = this.subscriptions.get(variable);
                    clients.forEach(client => {
                        if (client.clientId === clientId) {
                            clients.delete(client);
                        }
                    });
                    
                    if (clients.size === 0) {
                        this.subscriptions.delete(variable);
                    }
                }
            });
            
            logger.info(`Unsubscribed client ${clientId} from variables: ${variables.join(', ')}`);
            res.json({ success: true, unsubscribedVariables: variables });
        });
        
        // Start CSV export
        this.app.post('/csv/start', async (req, res) => {
            const { variables, filename, interval } = req.body;
            
            if (!variables || !Array.isArray(variables)) {
                return res.status(400).json({ error: 'Variables array is required' });
            }
            
            try {
                await this.startCSVExport(variables, filename, interval);
                res.json({ success: true, filename, variables });
            } catch (error) {
                logger.error('Failed to start CSV export:', error);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Stop CSV export
        this.app.post('/csv/stop', (req, res) => {
            const { filename } = req.body;
            
            if (this.csvWriters.has(filename)) {
                clearInterval(this.csvWriters.get(filename).interval);
                this.csvWriters.delete(filename);
                logger.info(`Stopped CSV export: ${filename}`);
                res.json({ success: true, filename });
            } else {
                res.status(404).json({ error: 'CSV export not found' });
            }
        });
        
        // Manual reconnection endpoint for troubleshooting
        this.app.post('/reconnect', (req, res) => {
            const { service } = req.body;
            
            try {
                if (service === 'pandaura' || !service) {
                    if (this.pandauraWs) {
                        this.pandauraWs.close();
                    }
                    setTimeout(() => this.connectToPandaUra(), 1000);
                }
                
                if (service === 'mqtt' || !service) {
                    if (this.mqttClient) {
                        this.mqttClient.end();
                    }
                    setTimeout(() => this.setupMQTT(), 1000);
                }
                
                res.json({ success: true, message: `Reconnection initiated for ${service || 'all services'}` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    
    setupWebSocket() {
        const wsPort = (parseInt(CONFIG.PORT) || 3001) + 1;
        this.wsServer = new WebSocket.Server({ port: wsPort });
        
        this.wsServer.on('connection', (ws, req) => {
            const clientId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            ws.clientId = clientId;
            this.connectedClients.add(ws);
            
            logger.info(`WebSocket client connected: ${clientId}`);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleClientMessage(ws, data);
                } catch (error) {
                    logger.error('Invalid WebSocket message:', error);
                }
            });
            
            ws.on('close', () => {
                this.connectedClients.delete(ws);
                this.cleanupClientSubscriptions(clientId);
                logger.info(`WebSocket client disconnected: ${clientId}`);
            });
            
            // Send welcome message
            ws.send(JSON.stringify({
                type: 'welcome',
                clientId,
                timestamp: Date.now()
            }));
        });
    }
    
    setupMQTT() {
        // MQTT is optional - only connect if explicitly enabled
        if (!CONFIG.MQTT_BROKER || CONFIG.MQTT_BROKER === 'disabled') {
            logger.info('MQTT disabled - skipping MQTT setup');
            return;
        }
        
        try {
            this.mqttClient = mqtt.connect(CONFIG.MQTT_BROKER, {
                connectTimeout: 5000,
                reconnectPeriod: 0 // Disable auto-reconnect to prevent spam
            });
            
            this.mqttClient.on('connect', () => {
                logger.info('Connected to MQTT broker');
                
                // Subscribe to command topics
                this.mqttClient.subscribe('pandaura/command/+');
                this.mqttClient.subscribe('pandaura/subscribe/+');
            });
            
            this.mqttClient.on('message', (topic, message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleMQTTMessage(topic, data);
                } catch (error) {
                    logger.error('Invalid MQTT message:', error);
                }
            });
            
            this.mqttClient.on('error', (error) => {
                logger.warn('MQTT connection failed (optional feature):', error.message);
                // Don't retry MQTT connection to avoid log spam
                if (this.mqttClient) {
                    this.mqttClient.end(true);
                    this.mqttClient = null;
                }
            });
            
        } catch (error) {
            logger.warn('MQTT setup failed (optional feature):', error.message);
        }
    }
    
    connectToPandaUra() {
        // Try different WebSocket endpoints that might exist
        const possibleUrls = [
            `ws://${CONFIG.PANDAURA_HOST}/ws/simulator`,
            `ws://${CONFIG.PANDAURA_HOST}/ws/data-bridge`,
            `ws://${CONFIG.PANDAURA_HOST}/ws`
        ];
        
        let urlIndex = 0;
        
        const attemptConnection = () => {
            if (urlIndex >= possibleUrls.length) {
                logger.warn('All PandaUra WebSocket endpoints failed - running in standalone mode');
                return;
            }
            
            const wsUrl = possibleUrls[urlIndex];
            logger.info(`Attempting PandaUra connection to: ${wsUrl}`);
            
            this.pandauraWs = new WebSocket(wsUrl);
            
            this.pandauraWs.on('open', () => {
                logger.info(`Connected to PandaUra Shadow Runtime at ${wsUrl}`);
                
                // Register as data bridge
                this.pandauraWs.send(JSON.stringify({
                    type: 'register',
                    service: 'data-bridge',
                    capabilities: ['websocket', 'mqtt', 'csv']
                }));
            });
            
            this.pandauraWs.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handlePandaUraMessage(data);
                } catch (error) {
                    logger.error('Invalid PandaUra message:', error);
                }
            });
            
            this.pandauraWs.on('error', (error) => {
                logger.warn(`PandaUra connection failed for ${wsUrl}:`, error.message);
                urlIndex++;
                setTimeout(attemptConnection, 1000);
            });
            
            this.pandauraWs.on('close', () => {
                logger.info('PandaUra connection closed - running in standalone mode');
                // Don't auto-reconnect to avoid spam - let manual reconnect handle it
            });
        };
        
        attemptConnection();
    }
    
    handleClientMessage(client, data) {
        switch (data.type) {
            case 'subscribe':
                this.subscribeClient(client, data.variables);
                break;
                
            case 'unsubscribe':
                this.unsubscribeClient(client, data.variables);
                break;
                
            case 'setValue':
                this.setVariableValue(data.variable, data.value, client.clientId);
                break;
                
            default:
                logger.warn(`Unknown client message type: ${data.type}`);
        }
    }
    
    handleMQTTMessage(topic, data) {
        const parts = topic.split('/');
        
        if (parts[1] === 'command' && parts[2] === 'setValue') {
            this.setVariableValue(data.variable, data.value, 'mqtt');
        } else if (parts[1] === 'subscribe') {
            const variable = parts[2];
            // Handle MQTT subscription (store for publishing)
            logger.info(`MQTT subscription to variable: ${variable}`);
        }
    }
    
    handlePandaUraMessage(data) {
        switch (data.type) {
            case 'variableUpdate':
                this.broadcastVariableUpdate(data.variable, data.value, data.timestamp);
                break;
                
            case 'bulkUpdate':
                data.variables.forEach(variable => {
                    this.broadcastVariableUpdate(variable.name, variable.value, data.timestamp);
                });
                break;
                
            case 'systemStatus':
                this.broadcastSystemStatus(data.status);
                break;
                
            default:
                logger.debug(`Unhandled PandaUra message type: ${data.type}`);
        }
    }
    
    subscribeClient(client, variables) {
        variables.forEach(variable => {
            if (!this.subscriptions.has(variable)) {
                this.subscriptions.set(variable, new Set());
                
                // Request subscription from PandaUra
                if (this.pandauraWs && this.pandauraWs.readyState === WebSocket.OPEN) {
                    this.pandauraWs.send(JSON.stringify({
                        type: 'subscribe',
                        variable
                    }));
                }
            }
            
            this.subscriptions.get(variable).add(client);
        });
        
        logger.info(`Client ${client.clientId} subscribed to: ${variables.join(', ')}`);
        
        client.send(JSON.stringify({
            type: 'subscribed',
            variables,
            timestamp: Date.now()
        }));
    }
    
    unsubscribeClient(client, variables) {
        variables.forEach(variable => {
            if (this.subscriptions.has(variable)) {
                this.subscriptions.get(variable).delete(client);
                
                if (this.subscriptions.get(variable).size === 0) {
                    this.subscriptions.delete(variable);
                    
                    // Unsubscribe from PandaUra
                    if (this.pandauraWs && this.pandauraWs.readyState === WebSocket.OPEN) {
                        this.pandauraWs.send(JSON.stringify({
                            type: 'unsubscribe',
                            variable
                        }));
                    }
                }
            }
        });
        
        logger.info(`Client ${client.clientId} unsubscribed from: ${variables.join(', ')}`);
    }
    
    cleanupClientSubscriptions(clientId) {
        this.subscriptions.forEach((clients, variable) => {
            clients.forEach(client => {
                if (client.clientId === clientId) {
                    clients.delete(client);
                }
            });
            
            if (clients.size === 0) {
                this.subscriptions.delete(variable);
                
                // Unsubscribe from PandaUra
                if (this.pandauraWs && this.pandauraWs.readyState === WebSocket.OPEN) {
                    this.pandauraWs.send(JSON.stringify({
                        type: 'unsubscribe',
                        variable
                    }));
                }
            }
        });
    }
    
    broadcastVariableUpdate(variable, value, timestamp) {
        const message = {
            type: 'variableUpdate',
            variable,
            value,
            timestamp: timestamp || Date.now()
        };
        
        // Broadcast to WebSocket clients
        if (this.subscriptions.has(variable)) {
            this.subscriptions.get(variable).forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        }
        
        // Publish to MQTT
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish(`pandaura/data/${variable}`, JSON.stringify(message));
        }
        
        // Write to active CSV exports
        this.csvWriters.forEach((writer, filename) => {
            if (writer.variables.includes(variable)) {
                writer.writeRecord({
                    timestamp: new Date(message.timestamp).toISOString(),
                    variable,
                    value
                });
            }
        });
    }
    
    broadcastSystemStatus(status) {
        const message = {
            type: 'systemStatus',
            status,
            timestamp: Date.now()
        };
        
        // Broadcast to all WebSocket clients
        this.connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
        
        // Publish to MQTT
        if (this.mqttClient && this.mqttClient.connected) {
            this.mqttClient.publish('pandaura/system/status', JSON.stringify(message));
        }
    }
    
    async setVariableValue(variable, value, source) {
        try {
            const response = await axios.post(`http://${CONFIG.PANDAURA_HOST}/api/simulate/set-variable`, {
                variable,
                value
            });
            
            if (response.data.success) {
                logger.info(`Variable ${variable} set to ${value} by ${source}`);
            } else {
                logger.error(`Failed to set variable ${variable}: ${response.data.error}`);
            }
            
        } catch (error) {
            logger.error(`Error setting variable ${variable}:`, error.message);
        }
    }
    
    async startCSVExport(variables, filename, interval = 1000) {
        const csvWriter = require('csv-writer').createObjectCsvWriter({
            path: path.join(CONFIG.CSV_OUTPUT_DIR, filename || `export_${Date.now()}.csv`),
            header: [
                { id: 'timestamp', title: 'Timestamp' },
                { id: 'variable', title: 'Variable' },
                { id: 'value', title: 'Value' }
            ]
        });
        
        // Ensure output directory exists
        await fs.mkdir(CONFIG.CSV_OUTPUT_DIR, { recursive: true });
        
        const exportInterval = setInterval(async () => {
            try {
                const records = [];
                const timestamp = new Date().toISOString();
                
                for (const variable of variables) {
                    const response = await axios.get(`http://${CONFIG.PANDAURA_HOST}/api/simulate/get-variable/${variable}`);
                    
                    if (response.data.success) {
                        records.push({
                            timestamp,
                            variable,
                            value: response.data.value
                        });
                    }
                }
                
                if (records.length > 0) {
                    await csvWriter.writeRecords(records);
                }
                
            } catch (error) {
                logger.error('CSV export error:', error);
            }
        }, interval);
        
        this.csvWriters.set(filename, {
            interval: exportInterval,
            variables,
            writeRecord: async (record) => {
                await csvWriter.writeRecords([record]);
            }
        });
        
        logger.info(`Started CSV export: ${filename} for variables: ${variables.join(', ')}`);
    }
    
    startDemoDataGenerator() {
        // Generate demo data when PandaUra is not connected (for testing)
        let demoValue = 50;
        let demoTrend = 1;
        
        setInterval(() => {
            // Only generate demo data if PandaUra is not connected
            if (!this.pandauraWs || this.pandauraWs.readyState !== WebSocket.OPEN) {
                // Simulate temperature sensor with slight variations
                demoValue += (Math.random() - 0.5) * 2 + demoTrend * 0.1;
                
                if (demoValue > 80) demoTrend = -1;
                if (demoValue < 20) demoTrend = 1;
                
                // Broadcast demo data
                this.broadcastVariableUpdate('Temp_Sensor', demoValue.toFixed(2), Date.now());
                this.broadcastVariableUpdate('Tank_Level', (demoValue * 0.8).toFixed(2), Date.now());
                this.broadcastVariableUpdate('Pump_Speed', Math.min(100, demoValue * 1.2).toFixed(1), Date.now());
            }
        }, 1000);
    }
    
    start() {
        this.server = this.app.listen(CONFIG.PORT, () => {
            const wsPort = (parseInt(CONFIG.PORT) || 3001) + 1;
            logger.info(`PandaUra Data Bridge started on port ${CONFIG.PORT}`);
            logger.info(`WebSocket server on port ${wsPort}`);
            logger.info(`Configuration: ${JSON.stringify(CONFIG, null, 2)}`);
        });
    }
    
    stop() {
        if (this.server) {
            this.server.close();
        }
        
        if (this.wsServer) {
            this.wsServer.close();
        }
        
        if (this.mqttClient) {
            this.mqttClient.end();
        }
        
        if (this.pandauraWs) {
            this.pandauraWs.close();
        }
        
        // Clear CSV export intervals
        this.csvWriters.forEach(writer => {
            clearInterval(writer.interval);
        });
        
        logger.info('PandaUra Data Bridge stopped');
    }
}

// Start the service
if (require.main === module) {
    const dataBridge = new DataBridgeService();
    dataBridge.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down gracefully');
        dataBridge.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down gracefully');
        dataBridge.stop();
        process.exit(0);
    });
}

module.exports = DataBridgeService;