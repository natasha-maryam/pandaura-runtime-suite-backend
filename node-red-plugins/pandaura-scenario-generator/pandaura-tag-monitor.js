/**
 * PandaUra Tag Monitor Node for Node-RED
 * 
 * Real-time tag value monitoring with threshold alerts
 */

module.exports = function(RED) {
    "use strict";
    
    const axios = require('axios');
    const WebSocket = require('ws');

    function PandauraTagMonitorNode(config) {
        RED.nodes.createNode(this, config);
        
        this.pandauraHost = config.pandauraHost || 'localhost:8000';
        this.tagName = config.tagName || '';
        this.pollInterval = parseInt(config.pollInterval) || 1000;
        this.thresholdType = config.thresholdType || 'none';
        this.minValue = parseFloat(config.minValue) || 0;
        this.maxValue = parseFloat(config.maxValue) || 100;
        this.enableWebSocket = config.enableWebSocket || false;
        
        const node = this;
        let pollTimer = null;
        let ws = null;
        
        node.status({ fill: "blue", shape: "dot", text: "ready" });
        
        // Start monitoring when input is received
        node.on('input', function(msg) {
            const tagName = msg.payload.tagName || msg.tagName || node.tagName;
            
            if (!tagName) {
                node.error('Tag name is required for monitoring');
                return;
            }
            
            const action = msg.payload.action || msg.topic || 'start';
            
            switch (action) {
                case 'start':
                    node.startMonitoring(tagName);
                    break;
                case 'stop':
                    node.stopMonitoring();
                    break;
                default:
                    node.warn(`Unknown action: ${action}`);
            }
        });
        
        // Start tag monitoring
        node.startMonitoring = function(tagName) {
            node.stopMonitoring(); // Stop any existing monitoring
            
            node.tagName = tagName;
            node.status({ fill: "green", shape: "dot", text: `monitoring ${tagName}` });
            
            if (node.enableWebSocket) {
                node.startWebSocketMonitoring(tagName);
            } else {
                node.startPollingMonitoring(tagName);
            }
        };
        
        // WebSocket-based real-time monitoring
        node.startWebSocketMonitoring = function(tagName) {
            try {
                const wsUrl = `ws://${node.pandauraHost}/ws/simulator/tags`;
                ws = new WebSocket(wsUrl);
                
                ws.on('open', () => {
                    node.log(`WebSocket connected for tag: ${tagName}`);
                    // Subscribe to specific tag
                    ws.send(JSON.stringify({ action: 'subscribe', tag: tagName }));
                });
                
                ws.on('message', (data) => {
                    try {
                        const tagData = JSON.parse(data);
                        node.processTagValue(tagData.tag, tagData.value, tagData.timestamp);
                    } catch (error) {
                        node.warn(`Invalid WebSocket message: ${error.message}`);
                    }
                });
                
                ws.on('error', (error) => {
                    node.error(`WebSocket error: ${error.message}`);
                    node.status({ fill: "red", shape: "dot", text: "ws error" });
                });
                
                ws.on('close', () => {
                    node.log('WebSocket connection closed');
                    if (ws) {
                        node.status({ fill: "yellow", shape: "dot", text: "disconnected" });
                    }
                });
                
            } catch (error) {
                node.error(`Failed to start WebSocket monitoring: ${error.message}`);
                node.startPollingMonitoring(tagName); // Fallback to polling
            }
        };
        
        // HTTP polling-based monitoring
        node.startPollingMonitoring = function(tagName) {
            pollTimer = setInterval(async () => {
                try {
                    const url = `http://${node.pandauraHost}/api/simulate/get-variable/${tagName}`;
                    const response = await axios.get(url, { timeout: 5000 });
                    
                    if (response.data.success) {
                        node.processTagValue(tagName, response.data.value, Date.now());
                    } else {
                        node.warn(`Failed to get tag value: ${response.data.error}`);
                    }
                    
                } catch (error) {
                    if (error.code === 'ECONNREFUSED') {
                        node.status({ fill: "red", shape: "dot", text: "connection refused" });
                    } else {
                        node.warn(`Polling error: ${error.message}`);
                    }
                }
            }, node.pollInterval);
        };
        
        // Process received tag value
        node.processTagValue = function(tagName, value, timestamp) {
            // Check thresholds
            let alert = null;
            
            switch (node.thresholdType) {
                case 'range':
                    if (value < node.minValue || value > node.maxValue) {
                        alert = {
                            type: 'threshold_violation',
                            message: `Tag ${tagName} value ${value} outside range [${node.minValue}, ${node.maxValue}]`,
                            severity: 'warning'
                        };
                    }
                    break;
                    
                case 'min':
                    if (value < node.minValue) {
                        alert = {
                            type: 'min_threshold',
                            message: `Tag ${tagName} value ${value} below minimum ${node.minValue}`,
                            severity: 'warning'
                        };
                    }
                    break;
                    
                case 'max':
                    if (value > node.maxValue) {
                        alert = {
                            type: 'max_threshold',
                            message: `Tag ${tagName} value ${value} above maximum ${node.maxValue}`,
                            severity: 'warning'
                        };
                    }
                    break;
            }
            
            // Prepare output message
            const msg = {
                topic: `tag/${tagName}`,
                payload: {
                    tagName,
                    value,
                    timestamp,
                    alert
                }
            };
            
            // Send to appropriate output
            if (alert) {
                node.status({ fill: "red", shape: "dot", text: `ALERT: ${value}` });
                node.send([null, msg]); // Send to alert output
            } else {
                node.status({ fill: "green", shape: "dot", text: `${tagName}: ${value}` });
                node.send([msg, null]); // Send to normal output
            }
        };
        
        // Stop monitoring
        node.stopMonitoring = function() {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            
            if (ws) {
                ws.close();
                ws = null;
            }
            
            node.status({ fill: "blue", shape: "dot", text: "stopped" });
        };
        
        // Cleanup on node close
        node.on('close', function() {
            node.stopMonitoring();
        });
    }
    
    RED.nodes.registerType("pandaura-tag-monitor", PandauraTagMonitorNode);
};