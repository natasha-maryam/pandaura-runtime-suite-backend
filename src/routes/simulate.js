const express = require('express');
const router = express.Router();

// Store simulator state
let simulatorState = {
  isRunning: false,
  isPaused: false,
  currentLogic: null,
  currentLine: null,
  breakpoints: [],
  ioValues: {
    Tank_Level: 50.0,
    Temperature_PV: 72.5,
    Temperature_SP: 75.0,
    Pump_Motor: false,
    Heater_Output: 0.0,
    Emergency_Stop: false,
  },
  logs: []
};

// POST /simulate/run - Run simulation with logic
router.post('/run', async (req, res) => {
  try {
    const { logic } = req.body;
    
    // Use shadow runtime logic if available, otherwise use provided logic
    const logicToRun = logic || (global.shadowRuntimeLogic ? global.shadowRuntimeLogic.content : null);
    
    if (!logicToRun) {
      return res.status(400).json({
        success: false,
        error: 'No logic provided and no logic deployed to shadow runtime'
      });
    }
    
    console.log('Starting simulator with logic:', logicToRun.substring(0, 100) + '...');
    
    // Initialize simulator state
    simulatorState.isRunning = true;
    simulatorState.isPaused = false;
    simulatorState.currentLogic = logicToRun;
    simulatorState.currentLine = 1;
    simulatorState.logs.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      message: global.shadowRuntimeLogic ? 
        `Simulator started with logic: ${global.shadowRuntimeLogic.name}` : 
        'Simulator started with provided logic',
      type: 'info'
    });
    
    res.json({
      success: true,
      message: 'Simulator started successfully',
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
    if (!simulatorState.isRunning) {
      return res.status(400).json({
        success: false,
        error: 'Simulator is not running'
      });
    }
    
    // Simulate step execution
    const lines = simulatorState.currentLogic.split('\n');
    simulatorState.currentLine = Math.min((simulatorState.currentLine || 1) + 1, lines.length);
    
    // Check for breakpoint
    const hasBreakpoint = simulatorState.breakpoints.includes(simulatorState.currentLine);
    if (hasBreakpoint) {
      simulatorState.isPaused = true;
      simulatorState.logs.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        message: `Execution paused at breakpoint on line ${simulatorState.currentLine}`,
        type: 'warning'
      });
    }
    
    // Simulate tag value changes
    if (Math.random() > 0.7) {
      const tagNames = Object.keys(simulatorState.ioValues);
      const randomTag = tagNames[Math.floor(Math.random() * tagNames.length)];
      const oldValue = simulatorState.ioValues[randomTag];
      let newValue;
      
      if (typeof oldValue === 'boolean') {
        newValue = Math.random() > 0.5;
      } else {
        newValue = oldValue + (Math.random() - 0.5) * 10;
      }
      
      simulatorState.ioValues[randomTag] = newValue;
      simulatorState.logs.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        message: `${randomTag}: ${oldValue} → ${newValue}`,
        type: 'tag_change'
      });
    }
    
    res.json({
      success: true,
      currentLine: simulatorState.currentLine,
      isPaused: simulatorState.isPaused,
      ioValues: simulatorState.ioValues
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /simulate/stop - Stop simulation
router.post('/stop', async (req, res) => {
  try {
    simulatorState.isRunning = false;
    simulatorState.isPaused = false;
    simulatorState.currentLine = null;
    
    simulatorState.logs.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      message: 'Simulator stopped',
      type: 'info'
    });
    
    res.json({
      success: true,
      message: 'Simulator stopped'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /simulate/status - Get simulation status
router.get('/status', (req, res) => {
  res.json({
    isRunning: simulatorState.isRunning,
    isPaused: simulatorState.isPaused,
    currentLine: simulatorState.currentLine,
    logicDeployed: !!global.shadowRuntimeLogic,
    deployedLogic: global.shadowRuntimeLogic ? {
      name: global.shadowRuntimeLogic.name,
      deployedAt: global.shadowRuntimeLogic.deployedAt
    } : null,
    ioValues: simulatorState.ioValues,
    breakpoints: simulatorState.breakpoints
  });
});

// GET /simulate/logs - Get simulation logs
router.get('/logs', (req, res) => {
  res.json(simulatorState.logs.slice(-50)); // Return last 50 logs
});

// POST /simulate/io - Set I/O value
router.post('/io', async (req, res) => {
  try {
    const { name, value } = req.body;
    
    if (name in simulatorState.ioValues) {
      const oldValue = simulatorState.ioValues[name];
      simulatorState.ioValues[name] = value;
      
      simulatorState.logs.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        message: `Manual I/O change - ${name}: ${oldValue} → ${value}`,
        type: 'user_action'
      });
      
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
    const { line } = req.body;
    
    if (simulatorState.breakpoints.includes(line)) {
      simulatorState.breakpoints = simulatorState.breakpoints.filter(bp => bp !== line);
      res.json({
        success: true,
        action: 'removed',
        line,
        breakpoints: simulatorState.breakpoints
      });
    } else {
      simulatorState.breakpoints.push(line);
      res.json({
        success: true,
        action: 'added',
        line,
        breakpoints: simulatorState.breakpoints
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

// GET /simulate/status - Get simulation status
router.get('/status', (req, res) => {
  res.json({
    running: true,
    uptime: Date.now(),
    version: '1.0.0'
  });
});

module.exports = router;
