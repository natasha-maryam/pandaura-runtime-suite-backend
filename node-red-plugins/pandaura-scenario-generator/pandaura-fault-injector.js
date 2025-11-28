/**
 * PandaUra Fault Injector Node for Node-RED
 * 
 * Dedicated node for fault injection operations
 */

module.exports = function(RED) {
    "use strict";
    
    const axios = require('axios');

    function PandauraFaultInjectorNode(config) {
        RED.nodes.createNode(this, config);
        
        this.pandauraHost = config.pandauraHost || 'localhost:8000';
        this.faultType = config.faultType || 'VALUE_DRIFT';
        this.target = config.target || '';
        this.parameter = parseFloat(config.parameter) || 0.0;
        this.duration = parseInt(config.duration) || 60000;
        
        const node = this;
        
        node.status({ fill: "blue", shape: "dot", text: "ready" });
        
        node.on('input', async function(msg) {
            try {
                // Override config with message properties if provided
                const faultConfig = {
                    target: msg.payload.target || msg.target || node.target,
                    fault_type: msg.payload.fault_type || msg.faultType || node.faultType,
                    parameter: msg.payload.parameter !== undefined ? msg.payload.parameter : node.parameter,
                    duration_ms: msg.payload.duration_ms || msg.duration || node.duration
                };
                
                if (!faultConfig.target) {
                    node.error('Target tag is required for fault injection');
                    return;
                }
                
                node.status({ fill: "yellow", shape: "dot", text: `injecting ${faultConfig.fault_type}` });
                
                // Call fault injection API
                const url = `http://${node.pandauraHost}/api/simulate/inject-fault`;
                const response = await axios.post(url, faultConfig);
                
                if (response.data.success) {
                    node.status({ fill: "green", shape: "dot", text: `${faultConfig.fault_type} active` });
                    
                    // Send success message
                    msg.payload = {
                        success: true,
                        faultId: response.data.faultId,
                        faultType: faultConfig.fault_type,
                        target: faultConfig.target,
                        parameter: faultConfig.parameter,
                        duration: faultConfig.duration_ms,
                        message: response.data.message
                    };
                    
                    node.send([msg, null]);
                    
                    // Auto-clear status after duration
                    setTimeout(() => {
                        if (node.status) {
                            node.status({ fill: "blue", shape: "dot", text: "ready" });
                        }
                    }, faultConfig.duration_ms);
                    
                } else {
                    throw new Error(response.data.error || 'Fault injection failed');
                }
                
            } catch (error) {
                node.status({ fill: "red", shape: "dot", text: "error" });
                node.error(`Fault injection failed: ${error.message}`);
                
                // Send error message
                msg.payload = {
                    success: false,
                    error: error.message
                };
                
                node.send([null, msg]);
            }
        });
    }
    
    RED.nodes.registerType("pandaura-fault-injector", PandauraFaultInjectorNode);
};