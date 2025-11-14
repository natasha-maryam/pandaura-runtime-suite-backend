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
        ...tag,
        lastUpdate: now,
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
    
    // In a real implementation, this would:
    // 1. Parse the logic file
    // 2. Extract tag references
    // 3. Send to shadow/live runtime
    // 4. Update runtime state
    
    // For now, store it as the "active" logic in shadow runtime
    // This could be stored in database or memory for simulator to access
    global.shadowRuntimeLogic = {
      id: logicId,
      name: logicFile.name,
      content: logicFile.content,
      vendor: logicFile.vendor,
      author: logicFile.author,
      deployedAt: new Date().toISOString(),
      status: 'active'
    };
    
    res.json({
      success: true,
      logicId,
      target,
      message: `Logic "${logicFile.name}" pushed to ${target} runtime successfully`,
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
    res.json({
      connected: true,
      shadowOk: true,
      liveOk: true,
      lastSync: new Date().toISOString(),
      latency: Math.floor(Math.random() * 50) + 10, // Simulate 10-60ms latency
      conflicts: [],
      deployedLogic: global.shadowRuntimeLogic || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;