/**
 * PandaUra Runtime Connect Node for Node-RED
 * 
 * Establishes and manages connection to PandaUra Shadow Runtime
 */

module.exports = function(RED) {
    "use strict";
    
    const axios = require('axios');
    const WebSocket = require('ws');

    function PandauraRuntimeConnectNode(config) {
        RED.nodes.createNode(this, config);
        
        this.pandauraHost = config.pandauraHost || 'localhost:8000';
        this.connectionType = config.connectionType || 'http';
        this.authToken = config.authToken || '';
        this.autoReconnect = config.autoReconnect || true;
        this.heartbeatInterval = parseInt(config.heartbeatInterval) || 30000;
        
        const node = this;
        let ws = null;
        let heartbeatTimer = null;
        let reconnectTimer = null;
        
        node.status({ fill: "blue", shape: "dot", text: "connecting..." });
        
        // Connection management
        node.connect = function() {
            if (node.connectionType === 'websocket') {
                node.connectWebSocket();
            } else {
                node.connectHTTP();
            }
        };
        
        // HTTP Connection
        node.connectHTTP = function() {
            const testUrl = `http://${node.pandauraHost}/api/simulate/status`;
            
            axios.get(testUrl, {
                timeout: 5000,
                headers: node.authToken ? { 'Authorization': `Bearer ${node.authToken}` } : {}
            })
            .then(response => {
                node.status({ fill: "green", shape: "dot", text: "connected (HTTP)" });
                node.log(`Connected to PandaUra Runtime at ${node.pandauraHost}`);
                
                // Start heartbeat
                node.startHeartbeat();
                
                // Emit connection event
                node.emit('connected', {
                    type: 'http',
                    host: node.pandauraHost,
                    status: response.data
                });
            })
            .catch(error => {
                node.status({ fill: "red", shape: "dot", text: "connection failed" });
                node.error(`Failed to connect to PandaUra Runtime: ${error.message}`);
                
                if (node.autoReconnect) {
                    node.scheduleReconnect();
                }
            });
        };
        
        // WebSocket Connection
        node.connectWebSocket = function() {
            try {
                const wsUrl = `ws://${node.pandauraHost}/ws/simulator`;
                ws = new WebSocket(wsUrl);
                
                ws.on('open', () => {
                    node.status({ fill: "green", shape: "dot", text: "connected (WebSocket)" });
                    node.log(`WebSocket connected to PandaUra Runtime at ${wsUrl}`);
                    
                    // Send authentication if token provided
                    if (node.authToken) {
                        ws.send(JSON.stringify({
                            type: 'auth',
                            token: node.authToken
                        }));
                    }
                    
                    // Register as Node-RED connector
                    ws.send(JSON.stringify({
                        type: 'register',
                        client: 'node-red',
                        capabilities: ['fault-injection', 'tag-monitoring', 'scenario-execution']
                    }));
                    
                    // Start heartbeat
                    node.startHeartbeat();
                    
                    // Emit connection event
                    node.emit('connected', {
                        type: 'websocket',
                        host: node.pandauraHost,
                        readyState: ws.readyState
                    });
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        node.handleRuntimeMessage(message);
                    } catch (error) {
                        node.warn(`Invalid WebSocket message: ${error.message}`);
                    }
                });
                
                ws.on('error', (error) => {
                    node.status({ fill: "red", shape: "dot", text: "connection error" });
                    node.error(`WebSocket error: ${error.message}`);
                    
                    if (node.autoReconnect) {
                        node.scheduleReconnect();
                    }
                });
                
                ws.on('close', () => {
                    node.status({ fill: "yellow", shape: "dot", text: "disconnected" });
                    node.log('WebSocket connection closed');
                    
                    if (node.autoReconnect) {
                        node.scheduleReconnect();
                    }
                    
                    node.emit('disconnected');
                });
                
            } catch (error) {
                node.status({ fill: "red", shape: "dot", text: "connection failed" });
                node.error(`Failed to create WebSocket connection: ${error.message}`);
                
                if (node.autoReconnect) {
                    node.scheduleReconnect();
                }
            }
        };
        
        // Handle runtime messages
        node.handleRuntimeMessage = function(message) {
            switch (message.type) {
                case 'auth_success':
                    node.log('Authentication successful');
                    break;
                    
                case 'auth_failed':
                    node.error('Authentication failed');
                    node.status({ fill: "red", shape: "dot", text: "auth failed" });
                    break;
                    
                case 'heartbeat_response':
                    // Heartbeat acknowledged
                    break;
                    
                case 'variable_update':
                    node.emit('variable_update', message.data);
                    break;
                    
                case 'fault_status':
                    node.emit('fault_status', message.data);
                    break;
                    
                case 'system_status':
                    node.emit('system_status', message.data);
                    break;
                    
                default:
                    node.emit('runtime_message', message);
            }
        };
        
        // Heartbeat management
        node.startHeartbeat = function() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
            }
            
            heartbeatTimer = setInterval(() => {
                node.sendHeartbeat();
            }, node.heartbeatInterval);
        };
        
        node.sendHeartbeat = function() {
            if (node.connectionType === 'websocket' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'heartbeat',
                    timestamp: Date.now()
                }));
            } else if (node.connectionType === 'http') {
                // HTTP heartbeat via status check
                axios.get(`http://${node.pandauraHost}/api/simulate/status`, {
                    timeout: 3000,
                    headers: node.authToken ? { 'Authorization': `Bearer ${node.authToken}` } : {}
                })
                .catch(error => {
                    node.warn(`Heartbeat failed: ${error.message}`);
                    if (node.autoReconnect) {
                        node.scheduleReconnect();
                    }
                });
            }
        };
        
        // Reconnection management
        node.scheduleReconnect = function() {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
            }
            
            reconnectTimer = setTimeout(() => {
                node.log('Attempting to reconnect...');
                node.connect();
            }, 5000);
        };
        
        // API methods for other nodes to use
        node.sendCommand = function(command, callback) {
            if (node.connectionType === 'websocket' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(command));
                if (callback) callback(null, { sent: true });
            } else if (node.connectionType === 'http') {
                const url = `http://${node.pandauraHost}${command.endpoint || '/api/simulate/command'}`;
                
                axios.post(url, command.data || command, {
                    timeout: 10000,
                    headers: node.authToken ? { 'Authorization': `Bearer ${node.authToken}` } : {}
                })
                .then(response => {
                    if (callback) callback(null, response.data);
                })
                .catch(error => {
                    if (callback) callback(error);
                });
            } else {
                if (callback) callback(new Error('Not connected to runtime'));
            }
        };
        
        node.isConnected = function() {
            if (node.connectionType === 'websocket') {
                return ws && ws.readyState === WebSocket.OPEN;
            } else {
                return node.status().text.includes('connected');
            }
        };
        
        // Input handler
        node.on('input', function(msg) {
            if (msg.payload && msg.payload.command) {
                node.sendCommand(msg.payload.command, (error, result) => {
                    if (error) {
                        node.error(`Command failed: ${error.message}`, msg);
                    } else {
                        msg.payload = result;
                        node.send(msg);
                    }
                });
            } else if (msg.topic === 'connect') {
                node.connect();
            } else if (msg.topic === 'disconnect') {
                node.disconnect();
            }
        });
        
        // Disconnect method
        node.disconnect = function() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            
            if (ws) {
                ws.close();
                ws = null;
            }
            
            node.status({ fill: "grey", shape: "dot", text: "disconnected" });
        };
        
        // Start initial connection
        node.connect();
        
        // Cleanup on node close
        node.on('close', function() {
            node.disconnect();
        });
    }
    
    RED.nodes.registerType("pandaura-runtime-connect", PandauraRuntimeConnectNode);
};