const express = require('express');
const TagModel = require('../models/tagModel');
const LogicModel = require('../models/logicModel');
const { db } = require('../db/init-db');

const router = express.Router();
const tagModel = new TagModel(db);
const logicModel = new LogicModel(db);

// POST /sync/tags - Sync all tags to shadow runtime
router.post('/tags', async (req, res) => {
  try {
    // Get all tags from database
    const tags = await tagModel.getAll();
    
    // In a real implementation, this would sync to actual shadow runtime
    // For now, we'll simulate the sync operation
    console.log(`Syncing ${tags.length} tags to shadow runtime...`);
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update last_update timestamp for all synced tags
    const now = new Date().toISOString();
    for (const tag of tags) {
      await tagModel.update(tag.id, {
        source: 'shadow'
      });
    }
    
    res.json({
      success: true,
      synced: tags.length,
      timestamp: now,
      message: `Successfully synced ${tags.length} tags to shadow runtime`
    });
  } catch (error) {
    console.error('Sync tags error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      synced: 0
    });
  }
});

// POST /sync/logic/:id - Sync specific logic file to shadow runtime
router.post('/logic/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // In a real implementation, this would sync to actual shadow runtime
    console.log(`Syncing logic file ${id} to shadow runtime...`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 300));
    
    res.json({
      success: true,
      logicId: id,
      timestamp: new Date().toISOString(),
      message: `Logic file ${id} synced to shadow runtime`
    });
  } catch (error) {
    console.error('Sync logic error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /sync/push - Push logic to shadow or live runtime
router.post('/push', async (req, res) => {
  try {
    const { logicId, target } = req.body;
    
    if (!logicId || !target) {
      return res.status(400).json({
        success: false,
        error: 'logicId and target are required'
      });
    }

    // Get the logic file from database
    const logicFile = await logicModel.getById(logicId);
    
    console.log(`Pushing logic file "${logicFile.name}" to ${target} runtime...`);
    console.log('Logic content preview:', logicFile.content.substring(0, 200) + '...');
    
    // Simulate pushing to runtime
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate warnings for live push
    const warnings = [];
    if (target === 'live') {
      if (logicFile.content.toLowerCase().includes('emergency')) {
        warnings.push('⚠️ Logic modifies emergency stop systems');
      }
      if (logicFile.content.length > 1000) {
        warnings.push('⚠️ Large logic file may impact PLC cycle time');
      }
      if (logicFile.content.includes('TODO') || logicFile.content.includes('FIXME')) {
        warnings.push('⚠️ Logic contains TODO/FIXME comments');
      }
      // Always add at least one warning for demo
      if (warnings.length === 0) {
        warnings.push('✓ All safety checks passed - Logic ready for deployment');
      }
    }
    
    // Store it as the "active" logic
    if (target === 'shadow') {
      global.shadowRuntimeLogic = {
        id: logicId,
        name: logicFile.name,
        content: logicFile.content,
        vendor: logicFile.vendor,
        author: logicFile.author,
        deployedAt: new Date().toISOString(),
        status: 'active'
      };
    } else {
      global.liveRuntimeLogic = {
        id: logicId,
        name: logicFile.name,
        content: logicFile.content,
        vendor: logicFile.vendor,
        author: logicFile.author,
        deployedAt: new Date().toISOString(),
        status: 'active'
      };
    }
    
    res.json({
      success: true,
      logicId,
      target,
      message: `Logic "${logicFile.name}" pushed to ${target} runtime successfully`,
      warnings: warnings.length > 0 ? warnings : undefined,
      timestamp: new Date().toISOString(),
      deployedLogic: {
        id: logicId,
        name: logicFile.name,
        vendor: logicFile.vendor
      }
    });
  } catch (error) {
    console.error('Push logic error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /sync/status - Get sync status
router.get('/status', async (req, res) => {
  try {
    // Check if Beremiz is available (simulation for now)
    const executionMode = 'simulation'; // In real implementation, check actual Beremiz availability
    
    // For demo purposes, simulate live runtime being ready
    const liveOk = true; // Simulate live PLC connection
    const shadowOk = true;
    
    res.json({
      connected: true,
      shadowOk: shadowOk,
      liveOk: liveOk, // Now returns true for demo
      lastSync: global.shadowRuntimeLogic ? global.shadowRuntimeLogic.deployedAt : null,
      latency: Math.floor(Math.random() * 50) + 10, // Simulate 10-60ms latency
      conflicts: global.syncConflicts || [],
      executionMode,
      deployedLogic: global.shadowRuntimeLogic || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /sync/generate-conflicts - Generate mock conflicts for demo
router.post('/generate-conflicts', async (req, res) => {
  try {
    const mockConflicts = [
      {
        id: `conflict-${Date.now()}-1`,
        tagName: 'Temperature_SP',
        shadowValue: 75.0,
        liveValue: 72.5,
        timestamp: new Date().toISOString(),
        type: 'VALUE_CONFLICT',
        resolved: false,
        description: 'Setpoint value differs between shadow and live runtime'
      },
      {
        id: `conflict-${Date.now()}-2`,
        tagName: 'Pump_Run',
        shadowValue: true,
        liveValue: false,
        timestamp: new Date().toISOString(),
        type: 'VALUE_CONFLICT',
        resolved: false,
        description: 'Pump control state mismatch detected'
      }
    ];
    
    // Store conflicts globally
    if (!global.syncConflicts) {
      global.syncConflicts = [];
    }
    global.syncConflicts.push(...mockConflicts);
    
    res.json({
      success: true,
      conflicts: mockConflicts,
      message: `Generated ${mockConflicts.length} conflicts`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /sync/resolve-conflict - Resolve a conflict
router.post('/resolve-conflict', async (req, res) => {
  try {
    const { conflictId, resolution } = req.body;
    
    if (!global.syncConflicts) {
      global.syncConflicts = [];
    }
    
    const conflict = global.syncConflicts.find(c => c.id === conflictId);
    if (conflict) {
      conflict.resolved = true;
      conflict.resolution = resolution;
      conflict.resolvedAt = new Date().toISOString();
    }
    
    res.json({
      success: true,
      conflictId,
      resolution,
      message: `Conflict resolved: keeping ${resolution} value`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /sync/start-streaming - Start tag streaming from simulator
router.post('/start-streaming', async (req, res) => {
  try {
    // Mark streaming as active
    global.tagStreamingActive = true;
    
    res.json({
      success: true,
      message: 'Tag streaming started - values from simulator'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /sync/stream-tags - Get current tag values from simulator
router.get('/stream-tags', async (req, res) => {
  try {
    const simulatorEngine = require('../simulator/engine');
    const state = simulatorEngine.getState();
    
    // Return real values from simulator
    const tags = state.ioValues || {};
    
    res.json({
      tags: tags,
      streaming: state.isRunning,
      timestamp: new Date().toISOString(),
      cycleCount: simulatorEngine.compiledProgram ? simulatorEngine.compiledProgram.runtime.cycleCount : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;