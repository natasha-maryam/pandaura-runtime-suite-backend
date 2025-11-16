const { compile } = require('../interpreter/st_interpreter');

class SimulatorEngine {
  constructor() {
    this.state = {
      isRunning: false,
      isPaused: false,
      currentLogic: null,
      currentLine: null,
      breakpoints: [],
      ioValues: {}, // Dynamically populated from ST code variables
      logs: [],
      executionMode: 'interpreter', // 'interpreter'
      variables: new Map()
    };
    
    this.executionInterval = null;
    this.cycleTime = 100; // ms
    this.compiledProgram = null; // ST interpreter compiled program
  }

  /**
   * Start the simulator with given logic
   * @param {string} logic - The logic code to execute
   * @param {Object} options - Execution options
   */
  async start(logic, options = {}) {
    try {
      const {
        cycleTime = 100,
        initialValues = {}
      } = options;

      this.state.currentLogic = logic;
      this.state.isRunning = true;
      this.state.isPaused = false;
      this.state.currentLine = 1;
      this.cycleTime = cycleTime;
      this.state.executionMode = 'interpreter';

      this.addLog(`Compiling ST code...`, 'info');

      // Compile the ST code using the interpreter
      try {
        this.compiledProgram = compile(logic);
        
        // Get variables with their initial values from the ST code declarations
        const vars = this.compiledProgram.getVars();
        
        // Only override with initialValues if explicitly provided, otherwise use ST code's initial values
        const initVals = { ...vars, ...initialValues };
        this.compiledProgram.init(initVals);
        
        // Sync initial values back to state and build ioValues dynamically
        const finalVars = this.compiledProgram.getVars();
        this.state.ioValues = {}; // Reset to build fresh from code
        
        Object.entries(finalVars).forEach(([name, value]) => {
          // Round numeric values to avoid floating point precision issues
          const roundedValue = typeof value === 'number' ? this.roundPrecision(value) : value;
          
          this.state.variables.set(name, roundedValue);
          
          // Add all non-function-block variables to ioValues
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            this.state.ioValues[name] = roundedValue;
          }
        });

        this.addLog(`ST code compiled successfully`, 'success');
        this.addLog(`Found ${Object.keys(finalVars).length} variables with initial values from code`, 'info');
        
      } catch (compileError) {
        this.addLog(`Compilation error: ${compileError.message}`, 'error');
        this.state.isRunning = false;
        throw new Error(`Failed to compile ST code: ${compileError.message}`);
      }

      // Start execution loop
      this.startExecutionLoop();

      return {
        success: true,
        executionMode: this.state.executionMode,
        message: `Simulator started with ST interpreter`,
        variableCount: this.state.variables.size
      };

    } catch (error) {
      this.addLog(`Simulator start error: ${error.message}`, 'error');
      this.state.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the simulator
   */
  stop() {
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.state.currentLine = null;
    
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = null;
    }

    const cycleCount = this.compiledProgram ? this.compiledProgram.runtime.cycleCount : 0;
    this.addLog(`Simulator stopped after ${cycleCount} cycles`, 'info');

    return {
      success: true,
      message: 'Simulator stopped',
      cycleCount
    };
  }

  /**
   * Reset the simulator runtime
   */
  reset() {
    if (this.compiledProgram) {
      this.compiledProgram.reset();
      this.state.variables.clear();
      
      // Sync back to initial values
      const vars = this.compiledProgram.getVars();
      Object.entries(vars).forEach(([name, value]) => {
        this.state.variables.set(name, value);
        if (this.state.ioValues.hasOwnProperty(name)) {
          this.state.ioValues[name] = value;
        }
      });

      this.addLog('Runtime reset to initial state', 'info');
    }

    return {
      success: true,
      message: 'Runtime reset'
    };
  }

  /**
   * Pause/Resume the simulator
   */
  togglePause() {
    this.state.isPaused = !this.state.isPaused;
    const status = this.state.isPaused ? 'paused' : 'resumed';
    this.addLog(`Simulator ${status}`, 'info');

    return {
      success: true,
      isPaused: this.state.isPaused,
      message: `Simulator ${status}`
    };
  }

  /**
   * Step through simulation one line at a time
   */
  async step() {
    if (!this.state.isRunning) {
      throw new Error('Simulator is not running');
    }

    if (!this.compiledProgram) {
      throw new Error('No compiled program available');
    }

    try {
      // Execute one cycle
      this.compiledProgram.step();
      
      // Update variables and ioValues
      this.syncVariablesFromRuntime();
      
      this.addLog(`Executed cycle ${this.compiledProgram.runtime.cycleCount}`, 'execution');

    } catch (error) {
      this.addLog(`Execution error: ${error.message}`, 'error');
      throw error;
    }

    return {
      success: true,
      cycleCount: this.compiledProgram.runtime.cycleCount,
      isPaused: this.state.isPaused,
      ioValues: this.state.ioValues,
      variables: Array.from(this.state.variables.entries()).map(([name, value]) => ({ name, value })),
      executionMode: this.state.executionMode
    };
  }

  /**
   * Set breakpoints
   * @param {Array<number>} breakpoints - Array of line numbers
   */
  setBreakpoints(breakpoints) {
    this.state.breakpoints = breakpoints || [];
    this.addLog(`Breakpoints set at lines: ${breakpoints.join(', ')}`, 'info');

    return {
      success: true,
      breakpoints: this.state.breakpoints
    };
  }

  /**
   * Get current simulator state
   */
  getState() {
    return {
      ...this.state,
      variables: Array.from(this.state.variables.entries()).map(([name, value]) => ({
        name,
        value
      }))
    };
  }

  /**
   * Start execution loop
   */
  startExecutionLoop() {
    this.executionInterval = setInterval(() => {
      if (!this.state.isPaused && this.state.isRunning && this.compiledProgram) {
        try {
          // Execute one cycle
          this.compiledProgram.step();
          
          // Sync variables from runtime to state
          this.syncVariablesFromRuntime();
          
          // Apply process simulation (physics) after logic execution
          this.applyProcessSimulation();
          
        } catch (error) {
          this.addLog(`Execution error: ${error.message}`, 'error');
          this.stop();
        }
      }
    }, this.cycleTime);
  }

  /**
   * Sync variables from the interpreter runtime to simulator state
   */
  syncVariablesFromRuntime() {
    if (!this.compiledProgram) return;

    const vars = this.compiledProgram.getVars();
    
    Object.entries(vars).forEach(([name, value]) => {
      // Round numeric values to avoid floating point precision issues
      const roundedValue = typeof value === 'number' ? this.roundPrecision(value) : value;
      const oldValue = this.state.variables.get(name);
      
      this.state.variables.set(name, roundedValue);
      
      // Update ioValues for all non-function-block variables
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        this.state.ioValues[name] = roundedValue;
        
        // Log significant changes
        if (oldValue !== roundedValue && this.compiledProgram.runtime.cycleCount % 10 === 0) {
          this.addLog(`${name} = ${roundedValue}`, 'tag_change');
        }
      }
    });
  }

  /**
   * Apply process simulation - simulates the physical process
   * This makes the temperature, tank level, etc. change based on control outputs
   */
  applyProcessSimulation() {
    if (!this.compiledProgram) return;

    try {
      // Get current variable values
      const vars = this.compiledProgram.getVars();
      
      // Temperature Process Simulation
      if ('Temperature_PV' in vars && 'Heater_Output' in vars) {
        let tempPV = vars.Temperature_PV || 20.0;
        const heaterOutput = vars.Heater_Output || 0.0;
        
        // Heat added by heater (proportional to output)
        const heatAdded = (heaterOutput / 100.0) * 0.3; // Max 0.3°C per cycle at 100%
        
        // Ambient cooling (always losing some heat)
        const ambientCooling = 0.05;
        
        // Update temperature
        tempPV = tempPV + heatAdded - ambientCooling;
        tempPV = Math.max(0, Math.min(150, tempPV)); // Clamp to realistic range
        tempPV = this.roundPrecision(tempPV); // Round to avoid precision errors
        
        // Write back to runtime
        this.compiledProgram.runtime.setVarValue('Temperature_PV', tempPV);
        this.state.variables.set('Temperature_PV', tempPV);
        this.state.ioValues.Temperature_PV = tempPV;
      }
      
      // Tank Level Process Simulation
      if ('Tank_Level' in vars && 'Pump_Run' in vars) {
        let tankLevel = vars.Tank_Level || 50.0;
        const pumpRun = vars.Pump_Run || false;
        
        // Pump adds liquid
        if (pumpRun) {
          tankLevel += 0.5; // Filling rate
        }
        
        // Natural drainage/usage
        tankLevel -= 0.15;
        
        // Clamp to valid range
        tankLevel = Math.max(0, Math.min(100, tankLevel));
        tankLevel = this.roundPrecision(tankLevel); // Round to avoid precision errors
        
        // Write back to runtime
        this.compiledProgram.runtime.setVarValue('Tank_Level', tankLevel);
        this.state.variables.set('Tank_Level', tankLevel);
        this.state.ioValues.Tank_Level = tankLevel;
      }
      
    } catch (error) {
      // Silently handle process simulation errors - not critical
      console.error('Process simulation error:', error.message);
    }
  }

  /**
   * Set variable value in the runtime
   * @param {string} name - Variable name
   * @param {any} value - Variable value
   */
  setVariable(name, value) {
    if (!this.compiledProgram) {
      throw new Error('No compiled program available');
    }

    try {
      const roundedValue = typeof value === 'number' ? this.roundPrecision(value) : value;
      
      this.compiledProgram.runtime.setVarValue(name, roundedValue);
      this.state.variables.set(name, roundedValue);
      
      // Update ioValues for non-function-block variables
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        this.state.ioValues[name] = roundedValue;
      }

      this.addLog(`Variable ${name} set to ${value}`, 'info');

      return {
        success: true,
        variable: name,
        value
      };
    } catch (error) {
      this.addLog(`Failed to set variable ${name}: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get variable value from the runtime
   * @param {string} name - Variable name
   */
  getVariable(name) {
    if (!this.compiledProgram) {
      throw new Error('No compiled program available');
    }

    try {
      const value = this.compiledProgram.runtime.getVarValue(name);
      return {
        success: true,
        variable: name,
        value
      };
    } catch (error) {
      throw new Error(`Variable ${name} not found`);
    }
  }

  /**
   * Round numeric values to avoid floating point precision errors
   * @param {number} value - Numeric value
   * @param {number} decimals - Number of decimal places (default 2)
   * @returns {number} Rounded value
   */
  roundPrecision(value, decimals = 2) {
    if (typeof value !== 'number' || !isFinite(value)) return value;
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Get all variables
   */
  getAllVariables() {
    if (!this.compiledProgram) {
      return {};
    }

    return this.compiledProgram.getVars();
  }

  /**
   * Add a log entry
   * @param {string} message - Log message
   * @param {string} type - Log type ('info', 'error', 'warning', 'success', 'execution', 'tag_change')
   */
  addLog(message, type = 'info') {
    this.state.logs.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      message,
      type
    });

    // Keep only last 100 log entries
    if (this.state.logs.length > 100) {
      this.state.logs = this.state.logs.slice(-100);
    }
  }
}

module.exports = new SimulatorEngine();