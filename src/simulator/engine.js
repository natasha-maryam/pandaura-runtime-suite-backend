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
    
    // Hyper-Granular Simulation Features (BE-351)
    this.hyperGranular = {
      // I/O Latency Modeling
      ioLatency: {
        enabled: true,
        defaultLatency: 2, // ms
        jitterRange: 0.5, // ±0.5ms
        ioQueue: new Map() // tag -> [{value, timestamp}]
      },
      
      // Scan Cycle Simulation
      scanCycle: {
        enabled: true,
        scanTimeMs: 10, // Default 10ms scan cycle
        currentScanCount: 0,
        lastScanStart: Date.now(),
        actualScanTime: 0
      },
      
      // Logic Load & Compute Quota
      computeQuota: {
        enabled: true,
        watchdogLimit: 50, // ms max execution per scan
        currentLoad: 0,
        routineCosts: new Map(), // routine -> execution cost
        faultEvents: []
      },
      
      // Data Type Overflow Modeling
      overflowModeling: {
        enabled: true,
        intMin: -32768,
        intMax: 32767,
        dintMin: -2147483648,
        dintMax: 2147483647,
        overflowExceptions: []
      }
    };
    
    // Fault Injection State (BE-352)
    this.faultInjection = {
      activeFaults: new Map(), // tag -> fault config
      faultHistory: [],
      driftStates: new Map() // tag -> drift state
    };
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
      
      // Initialize hyper-granular simulation settings
      this.initializeHyperGranularSimulation(options);

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
    // Use hyper-granular scan cycle if enabled
    const scanInterval = this.hyperGranular.scanCycle.enabled ? 
      this.hyperGranular.scanCycle.scanTimeMs : this.cycleTime;
    
    this.executionInterval = setInterval(() => {
      if (!this.state.isPaused && this.state.isRunning && this.compiledProgram) {
        try {
          if (this.hyperGranular.scanCycle.enabled) {
            // Use hyper-granular scan cycle execution
            this.executeHyperGranularScanCycle();
          } else {
            // Legacy execution mode
            this.compiledProgram.step();
          }
          
          // Sync variables from runtime to state
          this.syncVariablesFromRuntime();
          
          // Apply process simulation (physics) after logic execution
          this.applyProcessSimulation();
          
        } catch (error) {
          this.addLog(`Execution error: ${error.message}`, 'error');
          this.stop();
        }
      }
    }, scanInterval);
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

  // ============== HYPER-GRANULAR SIMULATION METHODS (BE-351) ==============

  /**
   * Initialize hyper-granular simulation settings
   */
  initializeHyperGranularSimulation(options = {}) {
    const { hyperGranular = {} } = options;
    
    // Configure I/O Latency
    if (hyperGranular.ioLatency) {
      Object.assign(this.hyperGranular.ioLatency, hyperGranular.ioLatency);
    }
    
    // Configure Scan Cycle
    if (hyperGranular.scanCycle) {
      Object.assign(this.hyperGranular.scanCycle, hyperGranular.scanCycle);
    }
    
    // Configure Compute Quota
    if (hyperGranular.computeQuota) {
      Object.assign(this.hyperGranular.computeQuota, hyperGranular.computeQuota);
    }
    
    // Configure Overflow Modeling
    if (hyperGranular.overflowModeling) {
      Object.assign(this.hyperGranular.overflowModeling, hyperGranular.overflowModeling);
    }
    
    this.addLog(`Hyper-granular simulation initialized: Scan=${this.hyperGranular.scanCycle.scanTimeMs}ms, I/O Latency=${this.hyperGranular.ioLatency.defaultLatency}ms`, 'info');
  }

  /**
   * Execute a single scan cycle with hyper-granular timing
   */
  executeHyperGranularScanCycle() {
    if (!this.compiledProgram || this.state.isPaused) return;
    
    const scanStart = Date.now();
    this.hyperGranular.scanCycle.lastScanStart = scanStart;
    this.hyperGranular.scanCycle.currentScanCount++;
    
    try {
      // Add ScanTime_ms system variable accessible in ST logic
      this.compiledProgram.runtime.setVarValue('ScanTime_ms', this.hyperGranular.scanCycle.scanTimeMs);
      this.compiledProgram.runtime.setVarValue('ScanCount', this.hyperGranular.scanCycle.currentScanCount);
      
      // Process I/O latency queue before execution
      this.processIOLatencyQueue();
      
      // Apply active fault injections
      this.applyFaultInjections();
      
      // Check compute quota before execution
      const executionStart = performance.now();
      
      // Execute one scan cycle
      this.compiledProgram.step();
      
      // Calculate execution time and check watchdog
      const executionTime = performance.now() - executionStart;
      this.hyperGranular.computeQuota.currentLoad = executionTime;
      
      if (this.hyperGranular.computeQuota.enabled && 
          executionTime > this.hyperGranular.computeQuota.watchdogLimit) {
        this.triggerWatchdogFault(executionTime);
      }
      
      // Update variables with overflow checking
      this.updateVariablesWithOverflowCheck();
      
      // Calculate actual scan time
      const scanEnd = Date.now();
      this.hyperGranular.scanCycle.actualScanTime = scanEnd - scanStart;
      
      // Queue I/O outputs with latency
      this.queueIOOutputsWithLatency();
      
    } catch (error) {
      this.addLog(`Scan cycle error: ${error.message}`, 'error');
    }
  }

  /**
   * Process I/O latency queue - simulate delayed I/O reads
   */
  processIOLatencyQueue() {
    if (!this.hyperGranular.ioLatency.enabled) return;
    
    const currentTime = Date.now();
    
    this.hyperGranular.ioLatency.ioQueue.forEach((queue, tagName) => {
      // Process queued values that have passed their latency delay
      const readyValues = queue.filter(item => 
        currentTime >= item.timestamp + this.calculateIOLatency()
      );
      
      if (readyValues.length > 0) {
        // Apply the most recent ready value
        const latestValue = readyValues[readyValues.length - 1];
        if (this.compiledProgram && this.compiledProgram.runtime.hasVar(tagName)) {
          this.compiledProgram.runtime.setVarValue(tagName, latestValue.value);
        }
        
        // Remove processed values from queue
        this.hyperGranular.ioLatency.ioQueue.set(tagName, 
          queue.filter(item => !readyValues.includes(item))
        );
      }
    });
  }

  /**
   * Calculate I/O latency with jitter
   */
  calculateIOLatency() {
    const baseLatency = this.hyperGranular.ioLatency.defaultLatency;
    const jitter = (Math.random() - 0.5) * 2 * this.hyperGranular.ioLatency.jitterRange;
    return Math.max(0, baseLatency + jitter);
  }

  /**
   * Queue I/O outputs with latency simulation
   */
  queueIOOutputsWithLatency() {
    if (!this.hyperGranular.ioLatency.enabled || !this.compiledProgram) return;
    
    // Get all current variable values
    const vars = this.compiledProgram.getVars();
    
    Object.entries(vars).forEach(([name, value]) => {
      // Check if this is an output tag (by convention, starts with 'Output' or ends with '_OUT')
      if (name.startsWith('Output') || name.endsWith('_OUT') || name.includes('OUTPUT')) {
        // Queue the value with latency
        if (!this.hyperGranular.ioLatency.ioQueue.has(name)) {
          this.hyperGranular.ioLatency.ioQueue.set(name, []);
        }
        
        this.hyperGranular.ioLatency.ioQueue.get(name).push({
          value,
          timestamp: Date.now()
        });
      }
    });
  }

  /**
   * Update variables with data type overflow checking
   */
  updateVariablesWithOverflowCheck() {
    if (!this.hyperGranular.overflowModeling.enabled || !this.compiledProgram) return;
    
    const vars = this.compiledProgram.getVars();
    
    Object.entries(vars).forEach(([name, value]) => {
      if (typeof value === 'number') {
        let overflowValue = value;
        let overflowDetected = false;
        
        // Check INT overflow (assume INT type for integer values in typical range)
        if (Number.isInteger(value)) {
          if (value > this.hyperGranular.overflowModeling.intMax) {
            overflowValue = this.hyperGranular.overflowModeling.intMin + 
                           (value - this.hyperGranular.overflowModeling.intMax - 1);
            overflowDetected = true;
          } else if (value < this.hyperGranular.overflowModeling.intMin) {
            overflowValue = this.hyperGranular.overflowModeling.intMax - 
                           (this.hyperGranular.overflowModeling.intMin - value - 1);
            overflowDetected = true;
          }
        }
        
        if (overflowDetected) {
          this.hyperGranular.overflowModeling.overflowExceptions.push({
            variable: name,
            originalValue: value,
            overflowValue,
            timestamp: Date.now(),
            type: 'INT_OVERFLOW'
          });
          
          // Update the variable with wrapped value
          this.compiledProgram.runtime.setVarValue(name, overflowValue);
          this.addLog(`INT overflow in ${name}: ${value} → ${overflowValue}`, 'warning');
        }
      }
    });
  }

  /**
   * Trigger watchdog fault event
   */
  triggerWatchdogFault(executionTime) {
    const faultEvent = {
      type: 'WATCHDOG_TIMEOUT',
      executionTime,
      limit: this.hyperGranular.computeQuota.watchdogLimit,
      timestamp: Date.now(),
      scanCount: this.hyperGranular.scanCycle.currentScanCount
    };
    
    this.hyperGranular.computeQuota.faultEvents.push(faultEvent);
    this.addLog(`Watchdog timeout: ${executionTime.toFixed(2)}ms > ${this.hyperGranular.computeQuota.watchdogLimit}ms`, 'error');
    
    // In a real PLC, this would stop execution. For simulation, we log and continue.
  }

  // ============== FAULT INJECTION API (BE-352) ==============

  /**
   * Inject a fault into the simulation
   */
  injectFault(faultConfig) {
    const { target, fault_type, parameter, duration_ms = 60000 } = faultConfig;
    
    const fault = {
      id: `fault_${Date.now()}`,
      target,
      type: fault_type,
      parameter,
      duration: duration_ms,
      startTime: Date.now(),
      endTime: Date.now() + duration_ms,
      active: true
    };
    
    this.faultInjection.activeFaults.set(target, fault);
    this.faultInjection.faultHistory.push(fault);
    
    // Initialize fault-specific state
    switch (fault_type) {
      case 'VALUE_DRIFT':
        this.faultInjection.driftStates.set(target, {
          originalValue: this.getVariableValue(target),
          driftRate: parameter, // per second
          startValue: this.getVariableValue(target),
          lastUpdate: Date.now()
        });
        break;
        
      case 'LOCK_VALUE':
        this.faultInjection.driftStates.set(target, {
          lockedValue: this.getVariableValue(target)
        });
        break;
        
      case 'FORCE_IO_ERROR':
        // Set IO error bit for the target
        const errorBitName = `${target}_ERROR`;
        if (this.compiledProgram && this.compiledProgram.runtime.hasVar(errorBitName)) {
          this.compiledProgram.runtime.setVarValue(errorBitName, true);
        }
        break;
    }
    
    this.addLog(`Fault injected: ${fault_type} on ${target} (duration: ${duration_ms}ms)`, 'warning');
    
    return {
      success: true,
      faultId: fault.id,
      message: `Fault ${fault_type} injected on ${target}`
    };
  }

  /**
   * Apply active fault injections during each scan cycle
   */
  applyFaultInjections() {
    const currentTime = Date.now();
    
    this.faultInjection.activeFaults.forEach((fault, target) => {
      if (currentTime > fault.endTime) {
        // Fault duration expired
        this.removeFault(target);
        return;
      }
      
      if (!this.compiledProgram || !this.compiledProgram.runtime.hasVar(target)) {
        return;
      }
      
      switch (fault.type) {
        case 'VALUE_DRIFT':
          this.applyValueDrift(target, fault);
          break;
          
        case 'LOCK_VALUE':
          this.applyValueLock(target, fault);
          break;
          
        case 'FORCE_IO_ERROR':
          // IO error is persistent until fault expires
          break;
      }
    });
  }

  /**
   * Apply value drift fault
   */
  applyValueDrift(target, fault) {
    const driftState = this.faultInjection.driftStates.get(target);
    if (!driftState) return;
    
    const currentTime = Date.now();
    const timeDelta = (currentTime - driftState.lastUpdate) / 1000; // seconds
    
    const currentValue = this.getVariableValue(target);
    const driftAmount = fault.parameter * timeDelta;
    const newValue = currentValue + driftAmount;
    
    this.compiledProgram.runtime.setVarValue(target, newValue);
    
    driftState.lastUpdate = currentTime;
    this.faultInjection.driftStates.set(target, driftState);
  }

  /**
   * Apply value lock fault
   */
  applyValueLock(target, fault) {
    const driftState = this.faultInjection.driftStates.get(target);
    if (!driftState) return;
    
    // Keep the value locked to the initial locked value
    this.compiledProgram.runtime.setVarValue(target, driftState.lockedValue);
  }

  /**
   * Remove a fault
   */
  removeFault(target) {
    const fault = this.faultInjection.activeFaults.get(target);
    if (fault) {
      fault.active = false;
      this.faultInjection.activeFaults.delete(target);
      this.faultInjection.driftStates.delete(target);
      
      // Clear IO error bit if applicable
      if (fault.type === 'FORCE_IO_ERROR') {
        const errorBitName = `${target}_ERROR`;
        if (this.compiledProgram && this.compiledProgram.runtime.hasVar(errorBitName)) {
          this.compiledProgram.runtime.setVarValue(errorBitName, false);
        }
      }
      
      this.addLog(`Fault ${fault.type} on ${target} expired`, 'info');
    }
  }

  /**
   * Get current variable value safely
   */
  getVariableValue(name) {
    if (this.compiledProgram && this.compiledProgram.runtime.hasVar(name)) {
      return this.compiledProgram.runtime.getVarValue(name);
    }
    return 0;
  }

  /**
   * Get hyper-granular simulation status
   */
  getHyperGranularStatus() {
    return {
      scanCycle: {
        scanTimeMs: this.hyperGranular.scanCycle.scanTimeMs,
        currentScanCount: this.hyperGranular.scanCycle.currentScanCount,
        actualScanTime: this.hyperGranular.scanCycle.actualScanTime
      },
      ioLatency: {
        enabled: this.hyperGranular.ioLatency.enabled,
        defaultLatency: this.hyperGranular.ioLatency.defaultLatency,
        queuedItems: Array.from(this.hyperGranular.ioLatency.ioQueue.entries()).map(([tag, queue]) => ({
          tag,
          queueSize: queue.length
        }))
      },
      computeQuota: {
        currentLoad: this.hyperGranular.computeQuota.currentLoad,
        watchdogLimit: this.hyperGranular.computeQuota.watchdogLimit,
        faultEventCount: this.hyperGranular.computeQuota.faultEvents.length
      },
      overflowModeling: {
        enabled: this.hyperGranular.overflowModeling.enabled,
        exceptionCount: this.hyperGranular.overflowModeling.overflowExceptions.length
      },
      activeFaults: Array.from(this.faultInjection.activeFaults.values())
    };
  }
}

module.exports = new SimulatorEngine();