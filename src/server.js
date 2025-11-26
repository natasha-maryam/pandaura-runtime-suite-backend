const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { initializeDatabase } = require('./db/init-db');
const { setupSocket } = require('./ws/socket');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true
}));

// Increase body size limits for large version payloads (logic files + tags)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const bodySize = JSON.stringify(req.body).length;
    console.log(`   Body size: ${(bodySize / 1024).toFixed(2)} KB`);
  }
  next();
});

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Load routes after database is ready
    const logicRoutes = require('./routes/logic');
    const tagRoutes = require('./routes/tags');
    const simulateRoutes = require('./routes/simulate');
    const sessionRoutes = require('./routes/sessions');
    const syncRoutes = require('./routes/sync');
    const projectRoutes = require('./routes/projects');
    const versionRoutes = require('./routes/versions');
    const deployRoutes = require('./routes/deploy');
    
    // Mount routes
    app.use('/api/logic', logicRoutes);
    app.use('/api/tags', tagRoutes);
    app.use('/api/simulate', simulateRoutes);
    app.use('/api/sessions', sessionRoutes);
    app.use('/api/sync', syncRoutes);
    app.use('/api/projects', projectRoutes);
    app.use('/api/versions', versionRoutes);
    app.use('/api/deploy', deployRoutes);
    
    // Health check
    app.get('/', (req, res) => res.json({
      ok: true,
      version: 'milestone-3-backend',
      timestamp: new Date().toISOString(),
      features: [
        'logic_files',
        'tag_management',
        'session_persistence',
        'validation_engine',
        'shadow_sync',
        'st_interpreter',
        'version_control',
        'release_management',
        'diff_engine',
        'snapshot_system',
        'deployment_workflow',
        'safety_checks',
        'approval_system',
        'automatic_rollback',
        'snapshot_promotion'
      ]
    }));

    // Start HTTP server with increased limits
    const PORT = process.env.PORT || 8000;
    const server = http.createServer({
      // Increase max header size to 16KB (default is 8KB)
      maxHeaderSize: 16384,
    }, app);
    
    // Set server timeout to 2 minutes for large payloads
    server.timeout = 120000;
    
    // Setup WebSocket
    setupSocket(server);
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API available at: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/`);
      console.log(`🔌 WebSocket available for real-time sync`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
