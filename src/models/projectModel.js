const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

class ProjectModel {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get all projects ordered by last opened
   */
  async getAllProjects() {
    const projects = await this.db('projects')
      .select('*')
      .orderBy('last_opened', 'desc');
    
    // Parse connection_profile JSON
    return projects.map(project => ({
      ...project,
      connection_profile: project.connection_profile 
        ? JSON.parse(project.connection_profile) 
        : null,
    }));
  }

  /**
   * Get a single project by ID
   */
  async getProjectById(projectId) {
    const project = await this.db('projects')
      .where({ id: projectId })
      .first();
    
    if (!project) {
      return null;
    }

    return {
      ...project,
      connection_profile: project.connection_profile 
        ? JSON.parse(project.connection_profile) 
        : null,
    };
  }

  /**
   * Create a new project
   */
  async createProject(projectData) {
    const projectId = uuidv4();
    const projectName = projectData.name;
    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    
    // Create project directories
    const projectBasePath = path.join(process.cwd(), 'data', 'projects', sanitizedName);
    const logicPath = path.join(projectBasePath, 'logic');
    const tagsPath = path.join(projectBasePath, 'tags');
    const versionsPath = path.join(projectBasePath, 'versions');

    try {
      // Create directory structure
      await fs.mkdir(projectBasePath, { recursive: true });
      await fs.mkdir(logicPath, { recursive: true });
      await fs.mkdir(tagsPath, { recursive: true });
      await fs.mkdir(versionsPath, { recursive: true });

      // Create default connection profile
      const defaultConnectionProfile = {
        vendor: 'neutral',
        ip: '',
        slot: 0,
        rack: 0,
        port: 502,
      };

      // Insert project record
      await this.db('projects').insert({
        id: projectId,
        name: projectName,
        file_path: projectBasePath,
        connection_profile: JSON.stringify(defaultConnectionProfile),
        created_at: new Date().toISOString(),
        last_opened: new Date().toISOString(),
      });

      // Return the created project
      return await this.getProjectById(projectId);
    } catch (error) {
      // Clean up directories if database insert fails
      try {
        await fs.rm(projectBasePath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to clean up project directories:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * Update project's last opened timestamp
   */
  async updateLastOpened(projectId) {
    await this.db('projects')
      .where({ id: projectId })
      .update({ last_opened: new Date().toISOString() });
  }

  /**
   * Update project details
   */
  async updateProject(projectId, updates) {
    const updateData = { ...updates };
    
    // Stringify connection_profile if provided
    if (updateData.connection_profile) {
      updateData.connection_profile = JSON.stringify(updateData.connection_profile);
    }

    await this.db('projects')
      .where({ id: projectId })
      .update(updateData);

    return await this.getProjectById(projectId);
  }

  /**
   * Delete a project and all its data
   */
  async deleteProject(projectId) {
    const project = await this.getProjectById(projectId);
    
    if (!project) {
      throw new Error('Project not found');
    }

    // Delete from database (CASCADE will handle related records)
    await this.db('projects')
      .where({ id: projectId })
      .delete();

    // Delete project directory
    try {
      await fs.rm(project.file_path, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to delete project directory:', error);
      // Continue even if directory deletion fails
    }

    return { success: true };
  }

  /**
   * Get project statistics
   */
  async getProjectStats(projectId) {
    const [logicCount, tagCount, versionCount] = await Promise.all([
      this.db('logic_files').where({ project_id: projectId }).count('* as count').first(),
      this.db('tags').where({ project_id: projectId }).count('* as count').first(),
      // Assuming versions will be tracked in future
      Promise.resolve({ count: 0 }),
    ]);

    return {
      logicFiles: parseInt(logicCount.count, 10),
      tags: parseInt(tagCount.count, 10),
      versions: 0, // Placeholder
    };
  }
}

module.exports = ProjectModel;
