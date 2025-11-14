const express = require('express');
const { db } = require('../db/init-db');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// GET /sessions/:id - Get user session
router.get('/:id', async (req, res) => {
  try {
    const session = await db('user_sessions')
      .where('id', req.params.id)
      .first();
    
    if (!session) {
      // Create new session
      const newSession = {
        id: req.params.id,
        editor_state: JSON.stringify({ activeFileId: null, unsavedChanges: {} }),
        open_tabs: JSON.stringify([]),
        settings: JSON.stringify({ autoSave: false, vendor: 'neutral' }),
        last_accessed: new Date().toISOString()
      };
      
      await db('user_sessions').insert(newSession);
      return res.json({
        ...newSession,
        editor_state: JSON.parse(newSession.editor_state),
        open_tabs: JSON.parse(newSession.open_tabs),
        settings: JSON.parse(newSession.settings)
      });
    }
    
    // Update last accessed
    await db('user_sessions')
      .where('id', req.params.id)
      .update({ last_accessed: new Date().toISOString() });
    
    res.json({
      ...session,
      editor_state: JSON.parse(session.editor_state || '{}'),
      open_tabs: JSON.parse(session.open_tabs || '[]'),
      settings: JSON.parse(session.settings || '{}')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /sessions/:id - Update user session
router.put('/:id', async (req, res) => {
  try {
    const { editor_state, open_tabs, settings } = req.body;
    
    const updatedSession = {
      editor_state: JSON.stringify(editor_state || {}),
      open_tabs: JSON.stringify(open_tabs || []),
      settings: JSON.stringify(settings || {}),
      last_accessed: new Date().toISOString()
    };
    
    const updated = await db('user_sessions')
      .where('id', req.params.id)
      .update(updatedSession);
    
    if (updated === 0) {
      // Create new session if not exists
      await db('user_sessions').insert({
        id: req.params.id,
        ...updatedSession
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /sessions/:id/save-editor-state - Save editor state (tabs, active file, etc.)
router.post('/:id/save-editor-state', async (req, res) => {
  try {
    const { activeFileId, openTabs, unsavedChanges } = req.body;
    
    const editorState = {
      activeFileId,
      openTabs: openTabs || [],
      unsavedChanges: unsavedChanges || {}
    };
    
    await db('user_sessions')
      .where('id', req.params.id)
      .update({
        editor_state: JSON.stringify(editorState),
        last_accessed: new Date().toISOString()
      });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;