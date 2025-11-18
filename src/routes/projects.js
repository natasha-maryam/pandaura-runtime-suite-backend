const express = require('express');
const router = express.Router();
const ProjectModel = require('../models/projectModel');
const { db } = require('../db/init-db');

const projectModel = new ProjectModel(db);

/**
 * GET /api/projects
 * Get all projects
 */
router.get('/', async (req, res) => {
  try {
    const projects = await projectModel.getAllProjects();
    
    // Get stats for each project
    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const stats = await projectModel.getProjectStats(project.id);
        return {
          ...project,
          stats,
        };
      })
    );

    res.json({
      success: true,
      projects: projectsWithStats,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects',
    });
  }
});

/**
 * GET /api/projects/:id
 * Get a single project by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await projectModel.getProjectById(req.params.id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const stats = await projectModel.getProjectStats(project.id);

    res.json({
      success: true,
      project: {
        ...project,
        stats,
      },
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project',
    });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required',
      });
    }

    const project = await projectModel.createProject({
      name: name.trim(),
      description: description?.trim(),
    });

    const stats = await projectModel.getProjectStats(project.id);

    res.status(201).json({
      success: true,
      project: {
        ...project,
        stats,
      },
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project',
    });
  }
});

/**
 * PUT /api/projects/:id/last-opened
 * Update project's last opened timestamp
 */
router.put('/:id/last-opened', async (req, res) => {
  try {
    await projectModel.updateLastOpened(req.params.id);
    
    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Error updating last opened:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update last opened',
    });
  }
});

/**
 * PUT /api/projects/:id
 * Update project details
 */
router.put('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const project = await projectModel.updateProject(req.params.id, updates);

    res.json({
      success: true,
      project,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update project',
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', async (req, res) => {
  try {
    await projectModel.deleteProject(req.params.id);
    
    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete project',
    });
  }
});

module.exports = router;
