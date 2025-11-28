# Grafana Setup for PandaUra Data Bridge

## Quick Install & Setup

### Option 1: Download Grafana Standalone
1. Go to https://grafana.com/grafana/download
2. Download "Windows Installer" or "Standalone Windows Binary"
3. Run installer or extract ZIP
4. Start Grafana (usually runs on port 3000)

### Option 2: Using Chocolatey (if available)
```powershell
choco install grafana
```

## Configure Data Source

1. **Open Grafana**: http://localhost:3000
2. **Login**: admin / admin (change password when prompted)
3. **Add Data Source**:
   - Go to Configuration → Data Sources
   - Click "Add data source"
   - Search for "JSON API" or "SimpleJson"
   - If not available, install from: https://grafana.com/grafana/plugins/simpod-json-datasource/

### Data Source Configuration:
- **Name**: PandaUra Data Bridge
- **URL**: http://localhost:3001
- **Access**: Server (default)
- **Custom HTTP Headers**: None needed
- **Auth**: None

**Save & Test** - should show green checkmark

## Create Dashboard

1. **Create Dashboard**: + → Dashboard
2. **Add Panel**: Add an empty panel
3. **Configure Panel**:
   - **Data Source**: PandaUra Data Bridge
   - **Query Type**: Time Series
   - **Metric**: Select or type `Temp_Sensor`
   - **Panel Title**: "Reactor Temperature Monitor"
   - **Unit**: Temperature → Celsius (°C)
   - **Min/Max**: Y-axis 0-100

4. **Add Second Panel** for Tank Level:
   - **Metric**: `Tank_Level`
   - **Panel Title**: "Cooling Tank Level"
   - **Unit**: Percent (%)

## Real-time Streaming Setup

For WebSocket streaming (advanced):
1. Install WebSocket plugin if available
2. Configure WebSocket data source:
   - **URL**: ws://localhost:3002
   - **Format**: JSON
   - **Parse**: Auto

## Test the Setup

1. Ensure Data Bridge is running: http://localhost:3001/health
2. Check WebSocket: ws://localhost:3002 (our test script confirms this works)
3. Import sample dashboard JSON (if we create one)

## For Video Recording

**Key Visual Elements:**
- Real-time temperature graph showing drift
- Tank level responding to temperature changes
- Time series showing fault injection events
- Clear labeling and professional dashboard design

**Camera Focus Points:**
- Graph reacting to Node-RED fault injection
- Real-time data updates (every second)
- Professional dashboard appearance
- Multiple metrics correlating (temp vs. tank level)