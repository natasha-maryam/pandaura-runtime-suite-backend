const { v4: uuidv4 } = require('uuid');

class TagModel {
  constructor(db) {
    this.db = db;
  }

  async getAll() {
    try {
      const tags = await this.db('tags')
        .select('*')
        .orderBy('name');
      
      // Parse metadata JSON
      return tags.map(tag => ({
        ...tag,
        metadata: tag.metadata ? JSON.parse(tag.metadata) : null,
        last_update: new Date(tag.last_update)
      }));
    } catch (error) {
      throw new Error(`Failed to fetch tags: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const tag = await this.db('tags')
        .where('id', id)
        .first();
      
      if (!tag) {
        throw new Error('Tag not found');
      }
      
      return {
        ...tag,
        metadata: tag.metadata ? JSON.parse(tag.metadata) : null,
        last_update: new Date(tag.last_update)
      };
    } catch (error) {
      throw new Error(`Failed to fetch tag: ${error.message}`);
    }
  }

  async create(data) {
    const { name, type, value, address, source = 'shadow', metadata } = data;
    
    if (!name || !type) {
      throw new Error('Name and type are required');
    }

    const id = uuidv4();
    
    try {
      const newTag = {
        id,
        name,
        type,
        value: value || null,
        address: address || '',
        last_update: new Date().toISOString(),
        source,
        metadata: metadata ? JSON.stringify(metadata) : null
      };
      
      await this.db('tags').insert(newTag);
      return {
        ...newTag,
        metadata: newTag.metadata ? JSON.parse(newTag.metadata) : null,
        last_update: new Date(newTag.last_update)
      };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('A tag with this name already exists');
      }
      throw new Error(`Failed to create tag: ${error.message}`);
    }
  }

  async update(id, data) {
    try {
      const existingTag = await this.getById(id);
      
      const updatedTag = {
        ...existingTag,
        ...data,
        last_update: new Date().toISOString(),
        metadata: data.metadata ? JSON.stringify(data.metadata) : existingTag.metadata
      };
      
      await this.db('tags')
        .where('id', id)
        .update(updatedTag);
        
      return {
        ...updatedTag,
        metadata: updatedTag.metadata ? JSON.parse(updatedTag.metadata) : null,
        last_update: new Date(updatedTag.last_update)
      };
    } catch (error) {
      throw new Error(`Failed to update tag: ${error.message}`);
    }
  }

  async updateValue(name, value, source = 'shadow') {
    try {
      const updated = await this.db('tags')
        .where('name', name)
        .update({
          value: value,
          source: source,
          last_update: new Date().toISOString()
        });
        
      if (updated === 0) {
        throw new Error('Tag not found');
      }
      
      return await this.db('tags').where('name', name).first();
    } catch (error) {
      throw new Error(`Failed to update tag value: ${error.message}`);
    }
  }

  async delete(id) {
    try {
      const deleted = await this.db('tags')
        .where('id', id)
        .del();
        
      if (deleted === 0) {
        throw new Error('Tag not found');
      }
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete tag: ${error.message}`);
    }
  }

  async getTagNames() {
    try {
      const tags = await this.db('tags')
        .select('name', 'type')
        .orderBy('name');
      
      return tags.map(tag => tag.name);
    } catch (error) {
      throw new Error(`Failed to fetch tag names: ${error.message}`);
    }
  }

  async syncToShadow() {
    try {
      // Update all tags to indicate they've been synced to shadow
      await this.db('tags')
        .update({
          source: 'shadow',
          last_update: new Date().toISOString()
        });
      
      return { success: true, message: 'All tags synced to shadow runtime' };
    } catch (error) {
      throw new Error(`Failed to sync tags: ${error.message}`);
    }
  }
}

module.exports = TagModel;