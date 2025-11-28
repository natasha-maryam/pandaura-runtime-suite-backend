/**
 * PandaUra Scenario Generator Node for Node-RED
 * 
 * This node allows visual creation of time-based test sequences and fault scenarios
 * for the PandaUra Simulator ecosystem.
 */

module.exports = function(RED) {
    "use strict";
    
    const axios = require('axios');

    // Main Scenario Generator Node
    function PandauraScenarioGeneratorNode(config) {
        RED.nodes.createNode(this, config);
        
        this.pandauraHost = config.pandauraHost || 'localhost:8000';
        this.projectId = config.projectId || '';
        this.scenarioName = config.scenarioName || 'Untitled Scenario';
        this.autoStart = config.autoStart || false;
        
        const node = this;
        
        node.status({ fill: "yellow", shape: "dot", text: "ready" });
        
        // Track scenario execution state
        this.scenarioState = {
            isRunning: false,
            currentStep: 0,
            startTime: null,
            steps: [],
            results: []
        };
        
        // Input handler for scenario execution
        node.on('input', function(msg) {
            const payload = msg.payload || {};
            const action = payload.action || msg.topic || 'execute';
            
            switch (action) {
                case 'execute':
                case 'start':
                    node.executeScenario(payload.scenario || payload.steps);
                    break;
                    
                case 'stop':
                    node.stopScenario();
                    break;
                    
                case 'status':
                    node.sendScenarioStatus();
                    break;
                    
                default:
                    node.warn(`Unknown action: ${action}`);
            }
        });
        
        // Execute a scenario with timed steps
        node.executeScenario = async function(scenarioSteps) {
            if (node.scenarioState.isRunning) {
                node.warn('Scenario already running. Stop current scenario first.');
                return;
            }
            
            if (!scenarioSteps || !Array.isArray(scenarioSteps)) {
                node.error('Invalid scenario steps. Expected array of step objects.');
                return;
            }
            
            node.scenarioState.isRunning = true;
            node.scenarioState.currentStep = 0;
            node.scenarioState.startTime = Date.now();
            node.scenarioState.steps = scenarioSteps;
            node.scenarioState.results = [];
            
            node.status({ fill: "green", shape: "dot", text: `executing (${scenarioSteps.length} steps)` });
            
            node.log(`Starting scenario execution: ${node.scenarioName} (${scenarioSteps.length} steps)`);
            
            // Send scenario start event
            node.send([{
                topic: 'scenario/started',
                payload: {
                    scenarioName: node.scenarioName,
                    totalSteps: scenarioSteps.length,
                    startTime: node.scenarioState.startTime
                }
            }, null, null]);
            
            try {
                // Execute each step at its scheduled time
                for (let i = 0; i < scenarioSteps.length; i++) {
                    if (!node.scenarioState.isRunning) break;
                    
                    const step = scenarioSteps[i];
                    node.scenarioState.currentStep = i;
                    
                    // Wait for the step's scheduled time
                    const delay = step.time_ms || 0;
                    if (delay > 0) {
                        await node.delay(delay);
                    }
                    
                    if (!node.scenarioState.isRunning) break;
                    
                    // Execute the step
                    const result = await node.executeStep(step, i);
                    node.scenarioState.results.push(result);
                    
                    // Send step result
                    node.send([null, {
                        topic: 'scenario/step',
                        payload: {
                            stepIndex: i,
                            step,
                            result,
                            timestamp: Date.now()
                        }
                    }, null]);
                    
                    // Update status
                    node.status({ 
                        fill: result.success ? "green" : "red", 
                        shape: "dot", 
                        text: `step ${i + 1}/${scenarioSteps.length} - ${result.success ? 'OK' : 'FAIL'}` 
                    });
                }
                
                // Scenario completed
                node.scenarioState.isRunning = false;
                const duration = Date.now() - node.scenarioState.startTime;
                const successCount = node.scenarioState.results.filter(r => r.success).length;
                
                node.status({ 
                    fill: successCount === scenarioSteps.length ? "green" : "yellow", 
                    shape: "dot", 
                    text: `completed (${successCount}/${scenarioSteps.length} passed)` 
                });
                
                // Send completion event
                node.send([null, null, {
                    topic: 'scenario/completed',
                    payload: {
                        scenarioName: node.scenarioName,
                        duration,
                        totalSteps: scenarioSteps.length,
                        successCount,
                        results: node.scenarioState.results
                    }
                }]);
                
            } catch (error) {
                node.scenarioState.isRunning = false;
                node.status({ fill: "red", shape: "dot", text: "error" });
                node.error(`Scenario execution failed: ${error.message}`);
            }
        };
        
        // Execute a single scenario step
        node.executeStep = async function(step, stepIndex) {
            const stepStart = Date.now();
            
            try {
                node.log(`Executing step ${stepIndex + 1}: ${step.action} on ${step.target || 'system'}`);
                
                switch (step.action) {
                    case 'SET_TAG':
                        return await node.setTagValue(step);
                        
                    case 'FAULT_INJECT':
                        return await node.injectFault(step);
                        
                    case 'WAIT':
                        await node.delay(step.duration || 1000);
                        return { success: true, message: `Waited ${step.duration || 1000}ms` };
                        
                    case 'CHECK_TAG':
                        return await node.checkTagValue(step);
                        
                    case 'START_SIMULATOR':
                        return await node.startSimulator(step);
                        
                    case 'STOP_SIMULATOR':
                        return await node.stopSimulator(step);
                        
                    default:
                        throw new Error(`Unknown step action: ${step.action}`);
                }
                
            } catch (error) {
                return {
                    success: false,
                    message: error.message,
                    duration: Date.now() - stepStart
                };
            }
        };
        
        // Set tag value via API
        node.setTagValue = async function(step) {
            const url = `http://${node.pandauraHost}/api/simulate/set-variable`;
            const response = await axios.post(url, {
                name: step.target,
                value: step.value
            });
            
            return {
                success: response.data.success,
                message: `Set ${step.target} = ${step.value}`,
                apiResponse: response.data
            };
        };
        
        // Inject fault via API
        node.injectFault = async function(step) {
            const url = `http://${node.pandauraHost}/api/simulate/inject-fault`;
            const response = await axios.post(url, {
                target: step.target,
                fault_type: step.fault_type,
                parameter: step.parameter,
                duration_ms: step.duration_ms || 60000
            });
            
            return {
                success: response.data.success,
                message: `Injected ${step.fault_type} fault on ${step.target}`,
                faultId: response.data.faultId,
                apiResponse: response.data
            };
        };
        
        // Check tag value via API
        node.checkTagValue = async function(step) {
            const url = `http://${node.pandauraHost}/api/simulate/get-variable/${step.target}`;
            const response = await axios.get(url);
            
            if (!response.data.success) {
                throw new Error(`Failed to get tag value: ${response.data.error}`);
            }
            
            const actualValue = response.data.value;
            const expectedValue = step.expectedValue;
            const tolerance = step.tolerance || 0;
            
            let passed = false;
            
            if (typeof expectedValue === 'number' && typeof actualValue === 'number') {
                passed = Math.abs(actualValue - expectedValue) <= tolerance;
            } else {
                passed = actualValue === expectedValue;
            }
            
            return {
                success: passed,
                message: `Tag ${step.target}: expected ${expectedValue}, got ${actualValue}`,
                actualValue,
                expectedValue,
                passed
            };
        };
        
        // Start simulator via API
        node.startSimulator = async function(step) {
            const url = `http://${node.pandauraHost}/api/simulate/run`;
            const response = await axios.post(url, {
                logic: step.logic,
                cycleTime: step.cycleTime || 100,
                initialValues: step.initialValues || {}
            });
            
            return {
                success: response.data.success,
                message: 'Simulator started',
                apiResponse: response.data
            };
        };
        
        // Stop simulator via API
        node.stopSimulator = async function(step) {
            const url = `http://${node.pandauraHost}/api/simulate/stop`;
            const response = await axios.post(url);
            
            return {
                success: response.data.success,
                message: 'Simulator stopped',
                apiResponse: response.data
            };
        };
        
        // Utility function for delays
        node.delay = function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        };
        
        // Stop scenario execution
        node.stopScenario = function() {
            if (node.scenarioState.isRunning) {
                node.scenarioState.isRunning = false;
                node.status({ fill: "yellow", shape: "dot", text: "stopped" });
                node.log('Scenario execution stopped by user');
                
                // Send stop event
                node.send([null, null, {
                    topic: 'scenario/stopped',
                    payload: {
                        scenarioName: node.scenarioName,
                        stoppedAt: node.scenarioState.currentStep,
                        results: node.scenarioState.results
                    }
                }]);
            }
        };
        
        // Send current scenario status
        node.sendScenarioStatus = function() {
            node.send([null, {
                topic: 'scenario/status',
                payload: {
                    isRunning: node.scenarioState.isRunning,
                    currentStep: node.scenarioState.currentStep,
                    totalSteps: node.scenarioState.steps.length,
                    results: node.scenarioState.results
                }
            }, null]);
        };
        
        // Cleanup on node close
        node.on('close', function() {
            node.stopScenario();
        });
    }
    
    // Register the node
    RED.nodes.registerType("pandaura-scenario-generator", PandauraScenarioGeneratorNode, {
        credentials: {
            apiKey: { type: "text" }
        }
    });
};