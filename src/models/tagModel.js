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
    const { name, type, value, address, source = 'shadow', metadata, project_id } = data;
    
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
        metadata: metadata ? JSON.stringify(metadata) : null,
        project_id: project_id || null
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
      
      // Map incoming data, handling both camelCase and snake_case
      const updateData = {
        last_update: new Date().toISOString()
      };
      
      // Only update fields that are provided
      if (data.name !== undefined) updateData.name = data.name;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.value !== undefined) updateData.value = data.value;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.source !== undefined) updateData.source = data.source;
      if (data.persist !== undefined) updateData.persist = data.persist;
      
      // Handle metadata
      if (data.metadata !== undefined) {
        updateData.metadata = typeof data.metadata === 'string' 
          ? data.metadata 
          : JSON.stringify(data.metadata);
      }
      
      await this.db('tags')
        .where('id', id)
        .update(updateData);
        
      const updatedTag = await this.getById(id);
      return updatedTag;
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

  // ============ Enhanced Tag Database Features ============

  // UDT Methods
  async getUDTs(projectId) {
    try {
      const query = this.db('udts').select('*').orderBy('name')
      if (projectId) {
        query.where('project_id', projectId)
      }
      return await query
    } catch (error) {
      throw new Error(`Failed to fetch UDTs: ${error.message}`)
    }
  }

  async createUDT(udtData) {
    const { name, description, members, createdBy, projectId } = udtData
    
    if (!name || !members) {
      throw new Error('Name and members are required')
    }

    const id = uuidv4()
    
    try {
      await this.db('udts').insert({
        id,
        name,
        description,
        members: JSON.stringify(members),
        created_by: createdBy,
        project_id: projectId,
        created_at: new Date().toISOString()
      })
      
      return await this.db('udts').where('id', id).first()
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('A UDT with this name already exists')
      }
      throw new Error(`Failed to create UDT: ${error.message}`)
    }
  }

  // Hierarchy Methods
  async getHierarchy(projectId) {
    try {
      const query = this.db('tag_hierarchy')
        .select('*')
        .orderBy(['parent_id', 'sort_order'])
      
      if (projectId) {
        query.where('project_id', projectId)
      }
      
      return await query
    } catch (error) {
      throw new Error(`Failed to fetch hierarchy: ${error.message}`)
    }
  }

  async createHierarchyNode(nodeData) {
    const { name, type, parentId, tagId, projectId, sortOrder = 0 } = nodeData
    const id = uuidv4()
    
    try {
      await this.db('tag_hierarchy').insert({
        id,
        name,
        type,
        parent_id: parentId,
        tag_id: tagId,
        project_id: projectId,
        sort_order: sortOrder
      })
      
      return await this.db('tag_hierarchy').where('id', id).first()
    } catch (error) {
      throw new Error(`Failed to create hierarchy node: ${error.message}`)
    }
  }

  // Validation Rules
  async addValidationRule(tagId, ruleData) {
    const { type, value, message, severity = 'error' } = ruleData
    const id = uuidv4()
    
    try {
      await this.db('tag_validation_rules').insert({
        id,
        tag_id: tagId,
        type,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        message,
        severity,
        enabled: true,
        created_at: new Date().toISOString()
      })
      
      return await this.db('tag_validation_rules').where('id', id).first()
    } catch (error) {
      throw new Error(`Failed to add validation rule: ${error.message}`)
    }
  }

  async getValidationRules(tagId) {
    try {
      return await this.db('tag_validation_rules')
        .where('tag_id', tagId)
        .where('enabled', true)
    } catch (error) {
      throw new Error(`Failed to fetch validation rules: ${error.message}`)
    }
  }

  // Alias Methods
  async addAlias(tagId, aliasData) {
    const { alias, vendorAddress, description } = aliasData
    const id = uuidv4()
    
    try {
      await this.db('tag_aliases').insert({
        id,
        tag_id: tagId,
        alias,
        vendor_address: vendorAddress,
        description,
        created_at: new Date().toISOString()
      })
      
      return await this.db('tag_aliases').where('id', id).first()
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('This alias already exists for this tag')
      }
      throw new Error(`Failed to add alias: ${error.message}`)
    }
  }

  async getAliases(tagId) {
    try {
      return await this.db('tag_aliases').where('tag_id', tagId)
    } catch (error) {
      throw new Error(`Failed to fetch aliases: ${error.message}`)
    }
  }

  // Dependency Tracking
  async addDependency(dependencyData) {
    const { tagId, dependsOnTagId, usageType, fileId, fileName, routine, lineNumber } = dependencyData
    const id = uuidv4()
    
    try {
      await this.db('tag_dependencies').insert({
        id,
        tag_id: tagId,
        depends_on_tag_id: dependsOnTagId,
        usage_type: usageType,
        file_id: fileId,
        file_name: fileName,
        routine,
        line_number: lineNumber,
        discovered_at: new Date().toISOString()
      })
      
      return await this.db('tag_dependencies').where('id', id).first()
    } catch (error) {
      throw new Error(`Failed to add dependency: ${error.message}`)
    }
  }

  async getDependencies(tagId) {
    try {
      return await this.db('tag_dependencies')
        .where('tag_id', tagId)
        .orWhere('depends_on_tag_id', tagId)
    } catch (error) {
      throw new Error(`Failed to fetch dependencies: ${error.message}`)
    }
  }

  // Lifecycle Management
  async updateLifecycle(tagId, lifecycle) {
    try {
      await this.db('tags')
        .where('id', tagId)
        .update({
          lifecycle,
          last_update: new Date().toISOString()
        })
      
      return await this.getById(tagId)
    } catch (error) {
      throw new Error(`Failed to update lifecycle: ${error.message}`)
    }
  }

  // Scope Management
  async updateScope(tagId, scope, scopeLocked = false) {
    try {
      await this.db('tags')
        .where('id', tagId)
        .update({
          scope,
          scope_locked: scopeLocked,
          last_update: new Date().toISOString()
        })
      
      return await this.getById(tagId)
    } catch (error) {
      throw new Error(`Failed to update scope: ${error.message}`)
    }
  }

  // Bulk Operations
  async bulkOperation(operationData) {
    const { operation, tagIds, changes, dryRun = true, projectId } = operationData
    const id = uuidv4()
    
    try {
      // Create operation record
      await this.db('bulk_operations').insert({
        id,
        operation,
        tag_ids: JSON.stringify(tagIds),
        changes: JSON.stringify(changes),
        dry_run: dryRun,
        status: 'pending',
        project_id: projectId,
        created_at: new Date().toISOString()
      })
      
      if (dryRun) {
        // Just return preview
        const preview = {
          successful: tagIds.length,
          failed: 0,
          warnings: []
        }
        
        await this.db('bulk_operations')
          .where('id', id)
          .update({
            preview: JSON.stringify(preview),
            status: 'completed',
            completed_at: new Date().toISOString()
          })
        
        return {
          id,
          operation,
          tagIds,
          preview,
          dryRun: true,
          status: 'completed'
        }
      }
      
      // Execute actual operation
      await this.db('bulk_operations')
        .where('id', id)
        .update({ status: 'running' })
      
      // Apply changes based on operation type
      let successful = 0
      let failed = 0
      const warnings = []
      
      for (const tagId of tagIds) {
        try {
          switch (operation) {
            case 'update':
              await this.update(tagId, changes)
              successful++
              break
            case 'delete':
              await this.delete(tagId)
              successful++
              break
            case 'rename':
              // Handle rename with refactoring
              warnings.push(`Rename for tag ${tagId} requires manual approval`)
              break
            default:
              warnings.push(`Unknown operation: ${operation}`)
          }
        } catch (error) {
          failed++
          warnings.push(`Failed for tag ${tagId}: ${error.message}`)
        }
      }
      
      const preview = { successful, failed, warnings }
      
      await this.db('bulk_operations')
        .where('id', id)
        .update({
          preview: JSON.stringify(preview),
          status: 'completed',
          completed_at: new Date().toISOString()
        })
      
      return {
        id,
        operation,
        tagIds,
        preview,
        dryRun: false,
        status: 'completed'
      }
    } catch (error) {
      await this.db('bulk_operations')
        .where('id', id)
        .update({ status: 'failed' })
      
      throw new Error(`Bulk operation failed: ${error.message}`)
    }
  }

  // Refactoring Preview
  async getRefactoringPreview(tagId, newName) {
    try {
      const tag = await this.getById(tagId)
      const oldName = tag.name
      
      // Find all dependencies
      const dependencies = await this.getDependencies(tagId)
      
      // Build affected files list
      const affectedFilesMap = new Map()
      
      for (const dep of dependencies) {
        if (!dep.file_id) continue
        
        if (!affectedFilesMap.has(dep.file_id)) {
          affectedFilesMap.set(dep.file_id, {
            fileId: dep.file_id,
            fileName: dep.file_name,
            occurrences: 0,
            changes: []
          })
        }
        
        const fileData = affectedFilesMap.get(dep.file_id)
        fileData.occurrences++
        fileData.changes.push({
          line: dep.line_number,
          oldText: oldName,
          newText: newName
        })
      }
      
      const affectedFiles = Array.from(affectedFilesMap.values())
      const totalOccurrences = affectedFiles.reduce((sum, f) => sum + f.occurrences, 0)
      
      let estimatedImpact = 'low'
      if (totalOccurrences > 50) estimatedImpact = 'high'
      else if (totalOccurrences > 10) estimatedImpact = 'medium'
      
      return {
        tagId,
        oldName,
        newName,
        affectedFiles,
        requiresApproval: tag.requires_approval || totalOccurrences > 10,
        estimatedImpact
      }
    } catch (error) {
      throw new Error(`Failed to generate refactoring preview: ${error.message}`)
    }
  }

  // Apply Refactoring
  async applyRefactoring(previewData) {
    const { tagId, oldName, newName, affectedFiles } = previewData
    const refactoringId = uuidv4()
    
    try {
      // Create refactoring record
      await this.db('tag_refactorings').insert({
        id: refactoringId,
        tag_id: tagId,
        old_name: oldName,
        new_name: newName,
        affected_files: JSON.stringify(affectedFiles),
        requires_approval: previewData.requiresApproval,
        approved: !previewData.requiresApproval,
        status: previewData.requiresApproval ? 'pending' : 'approved',
        created_at: new Date().toISOString()
      })
      
      if (!previewData.requiresApproval) {
        // Apply rename immediately
        await this.update(tagId, { name: newName })
        
        await this.db('tag_refactorings')
          .where('id', refactoringId)
          .update({
            status: 'applied',
            applied_at: new Date().toISOString()
          })
        
        return { success: true, message: 'Refactoring applied successfully' }
      }
      
      return { 
        success: true, 
        message: 'Refactoring created and pending approval',
        refactoringId 
      }
    } catch (error) {
      throw new Error(`Failed to apply refactoring: ${error.message}`)
    }
  }
}

module.exports = TagModel;
