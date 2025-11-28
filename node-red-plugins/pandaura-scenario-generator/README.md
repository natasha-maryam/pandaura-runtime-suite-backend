# PandaUra Node-RED Plugin Suite

Complete Node-RED integration for PandaUra Shadow Runtime, enabling visual scenario design, fault injection, and real-time monitoring for industrial automation testing.

## 📦 **Package Contents**

### **Core Nodes:**
1. **🔗 Runtime Connect** - Connection management for PandaUra Shadow Runtime
2. **🎯 Scenario Generator** - Visual test scenario design and execution  
3. **⚡ Fault Injector** - Precise fault injection for resilience testing
4. **📊 Tag Monitor** - Real-time variable monitoring with threshold alerts

## 🚀 **Installation**

### **Method 1: Manual Installation**
```bash
# Copy to Node-RED user directory
cp -r pandaura-scenario-generator ~/.node-red/node_modules/

# Restart Node-RED
node-red-restart
```

### **Method 2: NPM Installation** (Future)
```bash
npm install @pandaura/node-red-scenario-generator
```

## 🎮 **Node Reference**

### **Runtime Connect Node**
- **Purpose**: Establishes connection to PandaUra Shadow Runtime
- **Connection Types**: HTTP/REST API, WebSocket
- **Features**: Auto-reconnect, heartbeat monitoring, authentication
- **Usage**: Place one per flow to manage runtime connection

### **Scenario Generator Node**  
- **Purpose**: Design and execute complex test scenarios
- **Features**: Step-by-step execution, loops, checkpoints, JSON import/export
- **Actions**: setVariable, waitDelay, injectFault, checkpoint
- **Usage**: Create comprehensive test automation workflows

### **Fault Injector Node**
- **Purpose**: Inject precise faults for resilience testing
- **Fault Types**: VALUE_DRIFT, LOCK_VALUE, FORCE_IO_ERROR
- **Features**: Configurable parameters, duration control, real-time monitoring
- **Usage**: Simulate sensor failures and communication errors

### **Tag Monitor Node**
- **Purpose**: Real-time variable monitoring and alerting
- **Features**: WebSocket/HTTP polling, threshold alerts, dual outputs
- **Monitoring**: Continuous value tracking with alert generation
- **Usage**: Monitor critical variables during test execution

## 🔧 **Configuration Examples**

### **Basic Flow Setup:**
```
[Inject] → [Runtime Connect] → [Scenario Generator] → [Debug]
                ↓
         [Tag Monitor] → [Fault Injector]
```

### **Runtime Connect Configuration:**
```javascript
{
  pandauraHost: "localhost:8000",
  connectionType: "http", // or "websocket"
  authToken: "", // Optional bearer token
  autoReconnect: true,
  heartbeatInterval: 30000
}
```

### **Scenario Configuration:**
```javascript
{
  scenario: [
    {
      step: 1,
      action: "setVariable",
      target: "Temp_Sensor", 
      value: "45",
      description: "Set baseline temperature"
    },
    {
      step: 2,
      action: "injectFault",
      target: "Temp_Sensor",
      value: "VALUE_DRIFT",
      duration: "8000",
      description: "Simulate sensor drift"
    }
  ],
  loopCount: 1,
  loopDelay: 5000
}
```

## 🎬 **Video Recording Usage**

### **Thermal Runaway Test Scenario:**
1. **Connect**: Runtime Connect node to PandaUra (localhost:8000)
2. **Monitor**: Tag Monitor on "Temp_Sensor" with threshold alerts  
3. **Inject**: Fault Injector with VALUE_DRIFT on temperature sensor
4. **Scenario**: Full scenario execution with automated steps
5. **Verify**: Debug outputs showing real-time data and fault status

### **Visual Flow for Recording:**
```
[Start Test] → [Fault Injector: Temp Drift] → [Status Debug]
                        ↓
[Monitor Temp] → [Tag Monitor] → [Temp Display]
                        ↓
[Run Scenario] → [Scenario Generator] → [Progress Debug]
```

## 🔌 **API Integration**

### **PandaUra Endpoints Used:**
- `GET /api/simulate/status` - Runtime status check
- `POST /api/simulate/inject-fault` - Fault injection
- `GET /api/simulate/get-variable/{name}` - Variable monitoring
- `POST /api/simulate/set-variable` - Variable updates
- `WS /ws/simulator` - WebSocket real-time communication

### **Message Formats:**
```javascript
// Fault Injection
{
  faultType: "VALUE_DRIFT",
  variable: "Temp_Sensor", 
  duration: 10000,
  parameters: { driftRate: 2.0, maxDrift: 15.0 }
}

// Variable Update
{
  variable: "Tank_Level",
  value: 67.5,
  timestamp: 1640995200000
}
```

## 🛠️ **Development**

### **File Structure:**
```
pandaura-scenario-generator/
├── package.json                    # NPM package configuration
├── pandaura-runtime-connect.js     # Runtime connection node
├── pandaura-scenario-generator.js  # Scenario execution node  
├── pandaura-fault-injector.js      # Fault injection node
├── pandaura-tag-monitor.js         # Variable monitoring node
└── nodes/                          # HTML configuration files
    ├── pandaura-runtime-connect.html
    ├── pandaura-scenario-generator.html
    ├── pandaura-fault-injector.html
    └── pandaura-tag-monitor.html
```

### **Dependencies:**
- **axios**: HTTP client for REST API calls
- **ws**: WebSocket client for real-time communication
- **mqtt**: MQTT client (optional, for advanced integration)

## 📋 **Compatibility**

- **Node-RED**: >=3.0.0
- **Node.js**: >=16.0.0
- **PandaUra Runtime**: All versions with REST API support
- **Operating Systems**: Windows, Linux, macOS

## 🎯 **Use Cases**

1. **Automated Testing**: Create comprehensive test suites for PLC logic
2. **Fault Simulation**: Test system resilience under failure conditions  
3. **Continuous Monitoring**: Real-time tracking of critical variables
4. **Integration Testing**: Multi-system validation workflows
5. **Video Demonstrations**: Professional test recording and documentation

## 📞 **Support**

For issues, feature requests, or integration help:
- **Repository**: https://github.com/pandaura/node-red-scenario-generator
- **Documentation**: https://docs.pandaura.com/node-red
- **Community**: https://community.pandaura.com

---

**🎬 Ready for professional thermal runaway prevention video recording!**