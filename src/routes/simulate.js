const express = require('express');
const router = express.Router();
const simulatorEngine = require('../simulator/engine');
const axios = require('axios');

// Helper to sync tags from simulator variables
async function syncTagsFromSimulator(variables) {
  try {
    await axios.post('http://localhost:3001/api/tags/sync-from-simulator', {
      variables
    });
    console.log('Tags synced from simulator variables');
  } catch (error) {
    console.error('Failed to sync tags:', error.message);
  }
}

// POST /simulate/run - Run simulation with logic
router.post('/run', async (req, res) => {
  try {
    const { logic, cycleTime, initialValues } = req.body;
    
    // Use shadow runtime logic if available, otherwise use provided logic
    const logicToRun = logic || (global.shadowRuntimeLogic ? global.shadowRuntimeLogic.content : null);
    
    if (!logicToRun) {
      return res.status(400).json({
        success: false,
        error: 'No logic provided and no logic deployed to shadow runtime'
      });
    }
    
    console.log('Starting simulator with ST interpreter...');
    console.log('Logic preview:', logicToRun.substring(0, 200) + '...');
    
    const result = await simulatorEngine.start(logicToRun, {
      cycleTime,
      initialValues
    });
    
    const state = simulatorEngine.getState();
    
    // Auto-sync tags from simulator variables to tag database
    await syncTagsFromSimulator(state.ioValues);
    
    res.json({
      success: true,
      message: result.message,
      executionMode: result.executionMode,
      variableCount: result.variableCount,
      ioValues: state.ioValues, // Include dynamic variables from ST code
      logicSource: global.shadowRuntimeLogic ? 'shadow_runtime' : 'direct',
      logicName: global.shadowRuntimeLogic ? global.shadowRuntimeLogic.name : 'Unknown'
    });
  } catch (error) {
    console.error('Simulator run error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate/step - Step through simulation
router.post('/step', async (req, res) => {
  try {
    const result = await simulatorEngine.step();
    res.json(result);
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate/stop - Stop simulation
router.post('/stop', async (req, res) => {
  try {
    const result = simulatorEngine.stop();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate/reset - Reset simulation runtime
router.post('/reset', async (req, res) => {
  try {
    const result = simulatorEngine.reset();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /simulate/status - Get simulation status
router.get('/status', (req, res) => {
  const state = simulatorEngine.getState();
  res.json({
    isRunning: state.isRunning,
    isPaused: state.isPaused,
    currentLine: state.currentLine,
    executionMode: state.executionMode,
    logicDeployed: !!global.shadowRuntimeLogic,
    deployedLogic: global.shadowRuntimeLogic ? {
      name: global.shadowRuntimeLogic.name,
      deployedAt: global.shadowRuntimeLogic.deployedAt
    } : null,
    ioValues: state.ioValues,
    breakpoints: state.breakpoints,
    variables: state.variables,
    cycleCount: simulatorEngine.compiledProgram ? simulatorEngine.compiledProgram.runtime.cycleCount : 0
  });
});

// GET /simulate/variables - Get all variables
router.get('/variables', (req, res) => {
  try {
    const vars = simulatorEngine.getAllVariables();
    res.json({
      success: true,
      variables: vars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /simulate/variables/:name - Get specific variable
router.get('/variables/:name', (req, res) => {
  try {
    const { name } = req.params;
    const result = simulatorEngine.getVariable(name);
    res.json(result);
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// POST /simulate/variables/:name - Set variable value
router.post('/variables/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }
    
    const result = simulatorEngine.setVariable(name, value);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GET /simulate/logs - Get simulation logs
router.get('/logs', (req, res) => {
  const state = simulatorEngine.getState();
  res.json(state.logs.slice(-50)); // Return last 50 logs
});

// POST /simulate/io - Set I/O value
router.post('/io', async (req, res) => {
  try {
    const { name, value } = req.body;
    
    if (!name || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Both name and value are required'
      });
    }
    
    // Try to set the variable in the runtime
    try {
      const result = simulatorEngine.setVariable(name, value);
      res.json({
        success: true,
        name: result.variable,
        value: result.value,
        message: `Variable ${name} updated in runtime`
      });
    } catch (varError) {
      // If variable doesn't exist in runtime, just update ioValues
      const state = simulatorEngine.getState();
      if (name in state.ioValues) {
        const oldValue = state.ioValues[name];
        state.ioValues[name] = value;
        
        simulatorEngine.addLog(`Manual I/O change - ${name}: ${oldValue} → ${value}`, 'user_action');
        
        res.json({
          success: true,
          name,
          oldValue,
          newValue: value
        });
      } else {
        res.status(400).json({
          success: false,
          error: `I/O point '${name}' not found`
        });
      }
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate/pause - Pause/Resume simulation
router.post('/pause', async (req, res) => {
  try {
    const result = simulatorEngine.togglePause();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate/breakpoint - Toggle breakpoint
router.post('/breakpoint', async (req, res) => {
  try {
    const { line, breakpoints } = req.body;
    
    if (breakpoints) {
      // Set multiple breakpoints
      const result = simulatorEngine.setBreakpoints(breakpoints);
      res.json(result);
    } else if (line) {
      // Toggle single breakpoint
      const state = simulatorEngine.getState();
      let newBreakpoints;
      let action;
      
      if (state.breakpoints.includes(line)) {
        newBreakpoints = state.breakpoints.filter(bp => bp !== line);
        action = 'removed';
      } else {
        newBreakpoints = [...state.breakpoints, line];
        action = 'added';
      }
      
      const result = simulatorEngine.setBreakpoints(newBreakpoints);
      res.json({
        success: true,
        action,
        line,
        breakpoints: result.breakpoints
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Either line number or breakpoints array is required'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate - Legacy endpoint for compatibility
router.post('/', async (req, res) => {
  try {
    const { content, inputs = {} } = req.body;
    
    // Basic simulation result (placeholder for now)
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      outputs: {
        // Placeholder outputs based on content analysis
        'Output1': Math.random() > 0.5,
        'Output2': Math.floor(Math.random() * 100),
        'Status': 'Running'
      },
      execution_time: Math.random() * 10 + 1, // 1-11ms
      cycle_time: 5, // 5ms cycle
      memory_usage: Math.floor(Math.random() * 1024 + 512) // 512-1536 bytes
    };
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== FAULT INJECTION API (BE-352) ==============

// POST /simulate/inject-fault - Inject fault into simulation
router.post('/inject-fault', async (req, res) => {
  try {
    const { run_id, time_ms, action, target, fault_type, parameter, duration_ms } = req.body;
    
    console.log('🚨 FAULT INJECTION REQUEST:', {
      run_id,
      time_ms,
      action,
      target,
      fault_type,
      parameter,
      duration_ms
    });
    
    // Validate required fields
    if (!target || !fault_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: target and fault_type'
      });
    }
    
    // Validate fault type
    const validFaultTypes = ['VALUE_DRIFT', 'LOCK_VALUE', 'FORCE_IO_ERROR'];
    if (!validFaultTypes.includes(fault_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid fault_type. Must be one of: ${validFaultTypes.join(', ')}`
      });
    }
    
    // Check if simulator is running
    const state = simulatorEngine.getState();
    if (!state.isRunning) {
      return res.status(400).json({
        success: false,
        error: 'Simulator is not running. Start simulation first.'
      });
    }
    
    // Schedule fault injection after specified time
    if (time_ms && time_ms > 0) {
      setTimeout(() => {
        const result = simulatorEngine.injectFault({
          target,
          fault_type,
          parameter: parameter || 0,
          duration_ms: duration_ms || 60000
        });
        console.log('⏰ Scheduled fault injection executed:', result);
      }, time_ms);
      
      res.json({
        success: true,
        message: `Fault ${fault_type} scheduled for ${target} in ${time_ms}ms`,
        scheduled: true,
        run_id
      });
    } else {
      // Inject fault immediately
      const result = simulatorEngine.injectFault({
        target,
        fault_type,
        parameter: parameter || 0,
        duration_ms: duration_ms || 60000
      });
      
      res.json({
        success: result.success,
        message: result.message,
        faultId: result.faultId,
        run_id,
        scheduled: false
      });
    }
    
  } catch (error) {
    console.error('Fault injection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /simulate/faults - Get active faults and fault history
router.get('/faults', (req, res) => {
  try {
    const hyperStatus = simulatorEngine.getHyperGranularStatus();
    
    res.json({
      success: true,
      activeFaults: hyperStatus.activeFaults,
      faultHistory: simulatorEngine.faultInjection ? simulatorEngine.faultInjection.faultHistory : [],
      driftStates: simulatorEngine.faultInjection ? 
        Array.from(simulatorEngine.faultInjection.driftStates.entries()) : []
    });
    
  } catch (error) {
    console.error('Get faults error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /simulate/faults/:target - Remove specific fault
router.delete('/faults/:target', (req, res) => {
  try {
    const { target } = req.params;
    
    simulatorEngine.removeFault(target);
    
    res.json({
      success: true,
      message: `Fault removed from ${target}`
    });
    
  } catch (error) {
    console.error('Remove fault error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /simulate/hyper-granular-status - Get hyper-granular simulation status
router.get('/hyper-granular-status', (req, res) => {
  try {
    const status = simulatorEngine.getHyperGranularStatus();
    
    res.json({
      success: true,
      ...status
    });
    
  } catch (error) {
    console.error('Get hyper-granular status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /simulate/configure-hyper-granular - Configure hyper-granular settings
router.post('/configure-hyper-granular', (req, res) => {
  try {
    const { hyperGranular } = req.body;
    
    if (!hyperGranular) {
      return res.status(400).json({
        success: false,
        error: 'Missing hyperGranular configuration'
      });
    }
    
    // Apply configuration to the simulator
    simulatorEngine.initializeHyperGranularSimulation({ hyperGranular });
    
    res.json({
      success: true,
      message: 'Hyper-granular simulation configured',
      configuration: simulatorEngine.getHyperGranularStatus()
    });
    
  } catch (error) {
    console.error('Configure hyper-granular error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
