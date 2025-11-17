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

// POST /tags/sync-from-simulator - Auto-create/update tags from simulator variables
router.post('/sync-from-simulator', async (req, res) => {
  try {
    const { variables } = req.body;
    
    if (!variables || typeof variables !== 'object') {
      return res.status(400).json({ error: 'Variables object required' });
    }

    let created = 0;
    let updated = 0;
    const errors = [];

    for (const [name, value] of Object.entries(variables)) {
      try {
        // Skip function block objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          continue;
        }

        // Determine type
        let type = 'REAL';
        if (typeof value === 'boolean') type = 'BOOL';
        else if (typeof value === 'string') type = 'STRING';
        else if (Number.isInteger(value)) type = 'INT';
        else if (Array.isArray(value)) type = 'ARRAY';

        // Check if tag exists
        const existingTags = await tagModel.getAll();
        const existingTag = existingTags.find(t => t.name === name);

        if (existingTag) {
          // Update existing tag
          await tagModel.update(existingTag.id, {
            value: value,
            type: type,
            source: 'shadow'
          });
          updated++;
        } else {
          // Create new tag
          await tagModel.create({
            name,
            type,
            value,
            address: '',
            source: 'shadow',
            metadata: { auto_created: true, created_from: 'simulator' }
          });
          created++;
        }
      } catch (error) {
        errors.push({ name, error: error.message });
      }
    }

    res.json({
      success: true,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tags/export - Export all tags as JSON
router.get('/export', async (req, res) => {
  try {
    const tags = await tagModel.getAll();
    
    // Format for export
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      tagCount: tags.length,
      tags: tags.map(tag => ({
        name: tag.name,
        type: tag.type,
        value: tag.value,
        address: tag.address,
        source: tag.source,
        metadata: tag.metadata
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="tags-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tags/import - Import tags from JSON
router.post('/import', async (req, res) => {
  try {
    const { tags, replaceExisting } = req.body;
    
    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags array required' });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const tag of tags) {
      try {
        if (!tag.name || !tag.type) {
          errors.push({ tag: tag.name || 'unknown', error: 'Name and type required' });
          continue;
        }

        const existingTags = await tagModel.getAll();
        const existingTag = existingTags.find(t => t.name === tag.name);

        if (existingTag) {
          if (replaceExisting) {
            await tagModel.update(existingTag.id, {
              type: tag.type,
              value: tag.value,
              address: tag.address || '',
              source: tag.source || 'shadow',
              metadata: tag.metadata
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await tagModel.create({
            name: tag.name,
            type: tag.type,
            value: tag.value,
            address: tag.address || '',
            source: tag.source || 'shadow',
            metadata: tag.metadata
          });
          created++;
        }
      } catch (error) {
        errors.push({ tag: tag.name, error: error.message });
      }
    }

    res.json({
      success: true,
      created,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;