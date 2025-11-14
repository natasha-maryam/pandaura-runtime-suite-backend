const express = require('express');
const TagModel = require('../models/tagModel');
const { db } = require('../db/init-db');

const router = express.Router();
const tagModel = new TagModel(db);

// GET /tags - Get all tags
router.get('/', async (req, res) => {
  try {
    const tags = await tagModel.getAll();
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tags/names - Get tag names for autocomplete
router.get('/names', async (req, res) => {
  try {
    const names = await tagModel.getTagNames();
    res.json(names);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tags/:id - Get specific tag
router.get('/:id', async (req, res) => {
  try {
    const tag = await tagModel.getById(req.params.id);
    res.json(tag);
  } catch (error) {
    if (error.message === 'Tag not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /tags - Create new tag
router.post('/', async (req, res) => {
  try {
    const tag = await tagModel.create(req.body);
    res.status(201).json(tag);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('already exists')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// PUT /tags/:id - Update tag
router.put('/:id', async (req, res) => {
  try {
    const tag = await tagModel.update(req.params.id, req.body);
    res.json(tag);
  } catch (error) {
    if (error.message === 'Tag not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// PUT /tags/:name/value - Update tag value
router.put('/:name/value', async (req, res) => {
  try {
    const { value, source } = req.body;
    const tag = await tagModel.updateValue(req.params.name, value, source);
    res.json(tag);
  } catch (error) {
    if (error.message === 'Tag not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE /tags/:id - Delete tag
router.delete('/:id', async (req, res) => {
  try {
    const result = await tagModel.delete(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Tag not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /tags/sync-to-shadow - Sync all tags to shadow runtime
router.post('/sync-to-shadow', async (req, res) => {
  try {
    const result = await tagModel.syncToShadow();
    
    // Log the sync event
    await db('sync_events').insert({
      id: require('uuid').v4(),
      type: 'TAG_SYNC',
      timestamp: new Date().toISOString(),
      payload: JSON.stringify({ action: 'sync_all_to_shadow' }),
      source: 'shadow'
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;