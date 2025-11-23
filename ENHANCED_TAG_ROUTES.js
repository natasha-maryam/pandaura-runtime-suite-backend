// Append these routes to src/routes/tags.js before "module.exports = router;"

// ============ Enhanced Tag Database Routes ============

// UDT Routes
router.get('/udts', async (req, res) => {
  try {
    const { projectId } = req.query;
    const udts = await tagModel.getUDTs(projectId);
    res.json(udts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/udts', async (req, res) => {
  try {
    const udt = await tagModel.createUDT(req.body);
    res.status(201).json(udt);
  } catch (error) {
    if (error.message.includes('already exists')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Hierarchy Routes
router.get('/hierarchy', async (req, res) => {
  try {
    const { projectId } = req.query;
    const hierarchy = await tagModel.getHierarchy(projectId);
    res.json(hierarchy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/hierarchy', async (req, res) => {
  try {
    const node = await tagModel.createHierarchyNode(req.body);
    res.status(201).json(node);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validation Rules Routes
router.get('/:id/validation-rules', async (req, res) => {
  try {
    const rules = await tagModel.getValidationRules(req.params.id);
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/validation-rules', async (req, res) => {
  try {
    const rule = await tagModel.addValidationRule(req.params.id, req.body);
    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alias Routes
router.get('/:id/aliases', async (req, res) => {
  try {
    const aliases = await tagModel.getAliases(req.params.id);
    res.json(aliases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/aliases', async (req, res) => {
  try {
    const alias = await tagModel.addAlias(req.params.id, req.body);
    res.status(201).json(alias);
  } catch (error) {
    if (error.message.includes('already exists')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Dependency Routes
router.get('/:id/dependencies', async (req, res) => {
  try {
    const dependencies = await tagModel.getDependencies(req.params.id);
    res.json(dependencies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/dependencies', async (req, res) => {
  try {
    const dependency = await tagModel.addDependency(req.body);
    res.status(201).json(dependency);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lifecycle Management
router.put('/:id/lifecycle', async (req, res) => {
  try {
    const { lifecycle } = req.body;
    const tag = await tagModel.updateLifecycle(req.params.id, lifecycle);
    res.json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scope Management
router.put('/:id/scope', async (req, res) => {
  try {
    const { scope, locked } = req.body;
    const tag = await tagModel.updateScope(req.params.id, scope, locked);
    res.json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Operations
router.post('/bulk', async (req, res) => {
  try {
    const result = await tagModel.bulkOperation(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refactoring Routes
router.get('/:id/refactor-preview', async (req, res) => {
  try {
    const { newName } = req.query;
    if (!newName) {
      return res.status(400).json({ error: 'newName query parameter required' });
    }
    const preview = await tagModel.getRefactoringPreview(req.params.id, newName);
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refactor-apply', async (req, res) => {
  try {
    const result = await tagModel.applyRefactoring(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import Preview (with vendor mapping wizard)
router.post('/import-preview', async (req, res) => {
  try {
    // This would parse the uploaded file and generate mapping preview
    // For now, return a placeholder
    res.json({
      success: true,
      mappings: [],
      conflicts: [],
      message: 'Import preview not yet implemented'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
