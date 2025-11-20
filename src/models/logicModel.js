const { v4: uuidv4 } = require('uuid');

class LogicModel {
  constructor(db) {
    this.db = db;
  }

  async getAll(projectId = null) {
    try {
      let query = this.db('logic_files')
        .select('*')
        .orderBy('last_modified', 'desc');
      
      // Filter by project if projectId provided
      if (projectId) {
        query = query.where('project_id', projectId);
      }
      
      const files = await query;
      
      // Map database fields to frontend expected format
      return files.map(file => ({
        id: file.id,
        name: file.name,
        content: file.content,
        vendor: file.vendor,
        lastModified: file.last_modified,
        author: file.author,
        snapshot: file.snapshot,
        projectId: file.project_id
      }));
    } catch (error) {
      throw new Error(`Failed to fetch logic files: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const file = await this.db('logic_files')
        .where('id', id)
        .first();
      
      if (!file) {
        throw new Error('Logic file not found');
      }
      
      // Map database fields to frontend expected format
      return {
        id: file.id,
        name: file.name,
        content: file.content,
        vendor: file.vendor,
        lastModified: file.last_modified,
        author: file.author,
        snapshot: file.snapshot
      };
    } catch (error) {
      throw new Error(`Failed to fetch logic file: ${error.message}`);
    }
  }

  async create(data) {
    const { name, content, vendor = 'neutral', author = 'Engineer', projectId } = data;
    
    if (!name || !content) {
      throw new Error('Name and content are required');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    
    try {
      const newFile = {
        id,
        name,
        content,
        vendor,
        project_id: projectId || null,
        last_modified: now,
        author
      };
      
      await this.db('logic_files').insert(newFile);
      
      // Return in frontend expected format
      return {
        id,
        name,
        content,
        vendor,
        lastModified: now,
        author
      };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('A file with this name already exists');
      }
      throw new Error(`Failed to create logic file: ${error.message}`);
    }
  }

  async update(id, data) {
    try {
      const existingFile = await this.getById(id);
      const now = new Date().toISOString();
      
      // Prepare data for database (snake_case fields)
      const dbUpdateData = {
        name: data.name || existingFile.name,
        content: data.content || existingFile.content,
        vendor: data.vendor || existingFile.vendor,
        author: data.author || existingFile.author,
        last_modified: now
      };
      
      await this.db('logic_files')
        .where('id', id)
        .update(dbUpdateData);
      
      // Return in frontend expected format (camelCase)
      return {
        id,
        name: dbUpdateData.name,
        content: dbUpdateData.content,
        vendor: dbUpdateData.vendor,
        lastModified: now,
        author: dbUpdateData.author,
        snapshot: existingFile.snapshot
      };
    } catch (error) {
      throw new Error(`Failed to update logic file: ${error.message}`);
    }
  }

  async delete(id) {
    try {
      const deleted = await this.db('logic_files')
        .where('id', id)
        .del();
        
      if (deleted === 0) {
        throw new Error('Logic file not found');
      }
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete logic file: ${error.message}`);
    }
  }

  async validate(content, vendor = 'neutral') {
    const { STValidator } = require('../validators/stValidator');
    const validator = new STValidator();
    return validator.validate(content, vendor);
  }
}

module.exports = LogicModel;