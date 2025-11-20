const express = require('express');
const path = require('path');
const fs = require('fs');
const LogicModel = require('../models/logicModel');
const { db } = require('../db/init-db');

const router = express.Router();
const logicModel = new LogicModel(db);

// Helper function to format Structured Text code
function formatStructuredText(text, options = {}) {
  const lines = text.split('\n');
  const formatted = [];
  let indentLevel = 0;
  const indentSize = options.tabSize || 2;
  const useSpaces = options.insertSpaces !== false;
  const indent = useSpaces ? ' '.repeat(indentSize) : '\t';
  
  const increaseIndentKeywords = [
    'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_GLOBAL', 'VAR_TEMP',
    'IF', 'FOR', 'WHILE', 'REPEAT', 'CASE', 
    'PROGRAM', 'FUNCTION', 'FUNCTION_BLOCK'
  ];
  
  const decreaseIndentKeywords = [
    'END_VAR', 'END_IF', 'END_FOR', 'END_WHILE', 'END_REPEAT', 'END_CASE',
    'END_PROGRAM', 'END_FUNCTION', 'END_FUNCTION_BLOCK'
  ];
  
  const sameLineKeywords = ['ELSE', 'ELSIF', 'THEN', 'DO', 'OF'];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (line === '') {
      formatted.push('');
      continue;
    }
    
    // Handle comments
    if (line.startsWith('(*') || line.startsWith('//')) {
      formatted.push(indent.repeat(indentLevel) + line);
      continue;
    }
    
    // Check for keywords that should decrease indent
    const shouldDecreaseIndent = decreaseIndentKeywords.some(keyword => 
      line.toUpperCase().startsWith(keyword.toUpperCase())
    );
    
    // Check for keywords that maintain same level (ELSE, ELSIF)
    const isSameLineKeyword = sameLineKeywords.some(keyword => 
      line.toUpperCase().startsWith(keyword.toUpperCase())
    );
    
    if (shouldDecreaseIndent && indentLevel > 0) {
      indentLevel--;
    } else if (isSameLineKeyword && indentLevel > 0) {
      // ELSE and ELSIF should be at same level as IF
      // No change to indentLevel here
    }
    
    // Apply current indentation
    const indentedLine = indent.repeat(indentLevel) + line;
    formatted.push(indentedLine);
    
    // Check for keywords that should increase indent
    const shouldIncreaseIndent = increaseIndentKeywords.some(keyword => 
      line.toUpperCase().startsWith(keyword.toUpperCase())
    );
    
    if (shouldIncreaseIndent) {
      indentLevel++;
    } else if (line.toUpperCase().includes('THEN')) {
      indentLevel++;
    } else if (line.toUpperCase().includes('DO')) {
      indentLevel++;
    }
  }
  
  return formatted.join('\n');
}

// Advanced diff algorithm with moved block detection for better change detection
function generateAdvancedDiff(original, modified) {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const changes = [];
  
  // Step 1: Build line frequency maps to detect moves
  const origLineMap = new Map();
  const modLineMap = new Map();
  
  originalLines.forEach((line, index) => {
    if (line.trim() !== '') {  // Ignore empty lines for move detection
      if (!origLineMap.has(line)) origLineMap.set(line, []);
      origLineMap.get(line).push(index);
    }
  });
  
  modifiedLines.forEach((line, index) => {
    if (line.trim() !== '') {  // Ignore empty lines for move detection
      if (!modLineMap.has(line)) modLineMap.set(line, []);
      modLineMap.get(line).push(index);
    }
  });
  
  // Step 2: Detect potential moves (lines that exist in both but at different positions)
  const potentialMoves = new Set();
  for (const [line, origPositions] of origLineMap) {
    if (modLineMap.has(line)) {
      const modPositions = modLineMap.get(line);
      // If line exists in both files and positions don't overlap perfectly, it might be moved
      if (origPositions.length === 1 && modPositions.length === 1 && 
          Math.abs(origPositions[0] - modPositions[0]) > 5) {  // Only consider significant moves
        potentialMoves.add(line);
      }
    }
  }
  
  // Step 3: Use Myers diff algorithm for better performance with large files
  const diff = myersDiff(originalLines, modifiedLines, potentialMoves);
  
  let changeId = 0;
  
  // Step 4: Process diff results and categorize changes
  diff.forEach((change, index) => {
    if (change.type === 'equal') {
      // No change needed for equal lines
      return;
    }
    
    if (change.type === 'delete') {
      // Check if this is part of a move operation
      if (potentialMoves.has(change.line) && modLineMap.has(change.line)) {
        const modPos = modLineMap.get(change.line)[0];
        changes.push({
          type: 'moved',
          line: change.originalIndex + 1,
          newLine: modPos + 1,
          content: change.line,
          id: `move-${changeId++}`
        });
      } else {
        changes.push({
          type: 'removed',
          line: change.originalIndex + 1,
          content: change.line,
          id: `remove-${changeId++}`
        });
      }
    } else if (change.type === 'insert') {
      // Skip if already processed as a move
      if (!potentialMoves.has(change.line)) {
        changes.push({
          type: 'added',
          line: change.modifiedIndex + 1,
          content: change.line,
          id: `add-${changeId++}`
        });
      }
    }
  });
  
  // Step 5: Handle line modifications (not detected by simple insert/delete)
  const remainingChanges = findModifications(originalLines, modifiedLines, changes);
  changes.push(...remainingChanges.map(change => ({
    ...change,
    id: `modify-${changeId++}`
  })));
  
  const summary = {
    additions: changes.filter(c => c.type === 'added').length,
    deletions: changes.filter(c => c.type === 'removed').length,
    modifications: changes.filter(c => c.type === 'modified').length,
    moves: changes.filter(c => c.type === 'moved').length
  };
  
  return { changes, summary };
}

// Myers diff algorithm implementation (simplified)
function myersDiff(originalLines, modifiedLines, potentialMoves) {
  const orig = originalLines;
  const mod = modifiedLines;
  const n = orig.length;
  const m = mod.length;
  
  // For simplicity, use a basic implementation
  // In production, you'd want to use a library like 'diff' or implement full Myers algorithm
  const result = [];
  
  let i = 0, j = 0;
  
  while (i < n || j < m) {
    if (i < n && j < m && orig[i] === mod[j]) {
      result.push({ type: 'equal', line: orig[i], originalIndex: i, modifiedIndex: j });
      i++;
      j++;
    } else if (i < n && (j >= m || !mod.slice(j).includes(orig[i]))) {
      result.push({ type: 'delete', line: orig[i], originalIndex: i });
      i++;
    } else if (j < m) {
      result.push({ type: 'insert', line: mod[j], modifiedIndex: j });
      j++;
    }
  }
  
  return result;
}

// Find line modifications (content changes within same line position)
function findModifications(originalLines, modifiedLines, existingChanges) {
  const modifications = [];
  const changedLines = new Set(existingChanges.map(c => c.line));
  
  const minLength = Math.min(originalLines.length, modifiedLines.length);
  
  for (let i = 0; i < minLength; i++) {
    const origLine = originalLines[i];
    const modLine = modifiedLines[i];
    
    if (origLine !== modLine && !changedLines.has(i + 1)) {
      // Check if it's a significant change (not just whitespace)
      const origTrimmed = origLine.trim();
      const modTrimmed = modLine.trim();
      
      if (origTrimmed !== modTrimmed && origTrimmed !== '' && modTrimmed !== '') {
        modifications.push({
          type: 'modified',
          line: i + 1,
          originalContent: origLine,
          modifiedContent: modLine
        });
      }
    }
  }
  
  return modifications;
}

// Simple LCS implementation for better diff detection
function longestCommonSubsequence(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

// GET /logic - Get all logic files (optionally filtered by project)
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query;
    const files = await logicModel.getAll(projectId);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /logic/:id - Get specific logic file
router.get('/:id', async (req, res) => {
  try {
    const file = await logicModel.getById(req.params.id);
    res.json(file);
  } catch (error) {
    if (error.message === 'Logic file not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /logic - Create new logic file
router.post('/', async (req, res) => {
  try {
    const file = await logicModel.create(req.body);
    res.status(201).json(file);
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('already exists')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// PUT /logic/:id - Update logic file
router.put('/:id', async (req, res) => {
  try {
    const file = await logicModel.update(req.params.id, req.body);
    res.json(file);
  } catch (error) {
    if (error.message === 'Logic file not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE /logic/:id - Delete logic file
router.delete('/:id', async (req, res) => {
  try {
    const result = await logicModel.delete(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Logic file not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /logic/validate - Validate logic content
router.post('/validate', async (req, res) => {
  try {
    const { content, vendor } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required for validation' });
    }
    
    const validationResult = await logicModel.validate(content, vendor);
    res.json(validationResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /logic/:id/push-to-shadow - Push logic to shadow runtime
router.post('/:id/push-to-shadow', async (req, res) => {
  try {
    const file = await logicModel.getById(req.params.id);
    
    // Validate before pushing
    const validationResult = await logicModel.validate(file.content, file.vendor);
    
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Cannot push invalid logic to shadow runtime',
        validationResult
      });
    }
    
    // Store deployed logic globally for shadow runtime access
    global.shadowRuntimeLogic = {
      id: file.id,
      name: file.name,
      content: file.content,
      vendor: file.vendor,
      author: file.author,
      deployedAt: new Date().toISOString(),
      status: 'active'
    };
    
    // Simulate pushing to shadow runtime
    // In real implementation, this would communicate with the shadow runtime
    const pushResult = {
      success: true,
      message: 'Logic successfully pushed to shadow runtime',
      fileId: file.id,
      fileName: file.name,
      timestamp: new Date().toISOString(),
      shadowStatus: 'deployed'
    };
    
    // Log the sync event
    await db('sync_events').insert({
      id: require('uuid').v4(),
      type: 'LOGIC_PUSH',
      timestamp: new Date().toISOString(),
      payload: JSON.stringify({
        fileId: file.id,
        fileName: file.name,
        vendor: file.vendor,
        contentLength: file.content.length
      }),
      source: 'shadow'
    });
    
    res.json(pushResult);
  } catch (error) {
    if (error.message === 'Logic file not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /logic/format - Format Structured Text code
router.post('/format', async (req, res) => {
  try {
    const { content, options = {} } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required for formatting' });
    }
    
    const formattedContent = formatStructuredText(content, options);
    
    res.json({
      success: true,
      formatted: formattedContent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /logic/:id/diff - Get changes since last save (for change markers)
router.get('/:id/diff', async (req, res) => {
  try {
    const file = await logicModel.getById(req.params.id);
    const { currentContent } = req.query;
    
    if (!currentContent) {
      return res.json({ hasChanges: false, changes: [] });
    }
    
    // Enhanced diff implementation with better algorithm
    const diff = generateAdvancedDiff(file.content, currentContent);
    
    res.json({
      hasChanges: diff.changes.length > 0,
      changes: diff.changes,
      summary: diff.summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /logic/samples - No sample files available
router.get('/samples', async (req, res) => {
  try {
    // Samples removed - return empty array
    res.json({ samples: [] });
  } catch (error) {
    console.error('Error loading sample files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy route - kept for compatibility
router.get('/samples-old', async (req, res) => {
  try {
    const samplesDir = path.join(__dirname, '../../..', 'pandoura-main', 'public', 'sample-logic');
    
    // Check if samples directory exists
    if (!fs.existsSync(samplesDir)) {
      return res.json({ samples: [] });
    }
    
    const files = fs.readdirSync(samplesDir).filter(file => file.endsWith('.st'));
    const samples = [];
    
    for (const file of files) {
      const filePath = path.join(samplesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const name = path.basename(file, '.st');
      
      samples.push({
        id: `sample-${name.toLowerCase()}`,
        name: file,
        content,
        vendor: 'neutral',
        author: 'System',
        lastModified: new Date().toISOString(),
        isSample: true
      });
    }
    
    res.json({ samples });
  } catch (error) {
    console.error('Error loading sample files:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /logic/load-sample - Load a sample file into the database
router.post('/load-sample', async (req, res) => {
  try {
    const { sampleId } = req.body;
    
    if (!sampleId) {
      return res.status(400).json({ error: 'Sample ID is required' });
    }
    
    const samplesDir = path.join(__dirname, '../../..', 'pandoura-main', 'public', 'sample-logic');
    const sampleName = sampleId.replace('sample-', '');
    const fileName = `${sampleName.charAt(0).toUpperCase() + sampleName.slice(1)}.st`;
    const filePath = path.join(samplesDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Sample file not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Create logic file in database
    const logicFile = await logicModel.create({
      name: fileName,
      content,
      vendor: 'neutral',
      author: 'System Sample'
    });
    
    res.json({
      success: true,
      logicFile,
      message: `Sample "${fileName}" loaded successfully`
    });
  } catch (error) {
    console.error('Error loading sample:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;