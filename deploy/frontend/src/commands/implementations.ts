import { updateNode, moveNode, batchMoveNodes, deleteNode, createNode, batchDeleteNodes, batchUpdateNodes } from '../api/data';
import type { Node } from '../api/data';
import type { Command } from './types';
import { saveStateManager } from '../utils/saveStateManager';

type StateSetter = (updater: (prev: Node[]) => Node[]) => void;

export const createCommandFactory = (setNodes: StateSetter) => ({
  
  createUpdateContentCommand: (id: string, oldContent: string, newContent: string): Command => ({
    description: 'Update Content',
    execute: () => {
      const operationId = `cmd-update-content-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'updateContent', id, oldContent, newContent });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, content: newContent } : n));
      
      saveStateManager.markSaving(operationId);
      return updateNode(id, { content: newContent })
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to update content:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, content: oldContent } : n));
          throw err;
        });
    },
    undo: () => {
      const operationId = `undo-update-content-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'undoUpdateContent', id, oldContent, newContent });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, content: oldContent } : n));
      
      saveStateManager.markSaving(operationId);
      return updateNode(id, { content: oldContent })
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to undo content update:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, content: newContent } : n));
          throw err;
        });
    }
  }),

  createUpdateNoteCommand: (id: string, oldNote: string, newNote: string): Command => ({
    description: 'Update Note',
    execute: () => {
      const operationId = `cmd-update-note-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'updateNote', id, oldNote, newNote });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, note: newNote } : n));
      
      saveStateManager.markSaving(operationId);
      return updateNode(id, { note: newNote })
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to update note:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, note: oldNote } : n));
          throw err;
        });
    },
    undo: () => {
      const operationId = `undo-update-note-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'undoUpdateNote', id, oldNote, newNote });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, note: oldNote } : n));
      
      saveStateManager.markSaving(operationId);
      return updateNode(id, { note: oldNote })
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to undo note update:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, note: newNote } : n));
          throw err;
        });
    }
  }),

  createTogglePropertyCommand: (id: string, property: 'is_completed' | 'is_in_progress' | 'is_collapsed' | 'is_todo', newValue: boolean): Command => ({
    description: `Toggle ${property}`,
    execute: () => {
      const operationId = `cmd-toggle-${property}-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'toggleProperty', id, property, newValue });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, [property]: newValue } : n));
      
      saveStateManager.markSaving(operationId);
      return updateNode(id, { [property]: newValue })
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error(`Failed to toggle ${property}:`, err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, [property]: !newValue } : n));
          throw err;
        });
    },
    undo: () => {
      const operationId = `undo-toggle-${property}-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'undoToggleProperty', id, property, newValue });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, [property]: !newValue } : n));
      
      saveStateManager.markSaving(operationId);
      return updateNode(id, { [property]: !newValue })
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error(`Failed to undo toggle ${property}:`, err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, [property]: newValue } : n));
          throw err;
        });
    }
  }),

  createBatchTogglePropertyCommand: (ids: string[], property: 'is_completed' | 'is_collapsed' | 'is_todo', newValue: boolean): Command => ({
    description: `Batch Toggle ${property}`,
    execute: () => {
      const operationId = `cmd-batch-toggle-${property}-${Date.now()}`;
      const oldValues = new Map<string, boolean>();
      
      saveStateManager.markPending(operationId, { type: 'batchToggleProperty', ids, property, newValue });
      
      setNodes(nodes => nodes.map(n => {
        if (ids.includes(n.id)) {
          oldValues.set(n.id, n[property]);
          return { ...n, [property]: newValue };
        }
        return n;
      }));
      
      saveStateManager.markSaving(operationId);
      return batchUpdateNodes(ids.map(id => ({ id, [property]: newValue })))
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to batch toggle:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => {
            if (ids.includes(n.id) && oldValues.has(n.id)) {
              return { ...n, [property]: oldValues.get(n.id)! };
            }
            return n;
          }));
          throw err;
        });
    },
    undo: () => {
      const operationId = `undo-batch-toggle-${property}-${Date.now()}`;
      const currentValues = new Map<string, boolean>();
      
      saveStateManager.markPending(operationId, { type: 'undoBatchToggleProperty', ids, property, newValue });
      
      setNodes(nodes => nodes.map(n => {
        if (ids.includes(n.id)) {
          currentValues.set(n.id, n[property]);
          return { ...n, [property]: !newValue };
        }
        return n;
      }));
      
      saveStateManager.markSaving(operationId);
      return batchUpdateNodes(ids.map(id => ({ id, [property]: !newValue })))
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to undo batch toggle:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => {
            if (ids.includes(n.id) && currentValues.has(n.id)) {
              return { ...n, [property]: currentValues.get(n.id)! };
            }
            return n;
          }));
          throw err;
        });
    }
  }),

  createMoveNodeCommand: (id: string, oldParent: string | null, oldOrder: number, newParent: string | null, newOrder: number): Command => ({
    description: 'Move Node',
    execute: () => {
      const operationId = `cmd-move-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'moveNode', id, oldParent, oldOrder, newParent, newOrder });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, parent_node_id: newParent, sort_order: newOrder } : n));
      
      saveStateManager.markSaving(operationId);
      return moveNode(id, newParent, newOrder)
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to move node:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, parent_node_id: oldParent, sort_order: oldOrder } : n));
          throw err;
        });
    },
    undo: () => {
      const operationId = `undo-move-${id}-${Date.now()}`;
      saveStateManager.markPending(operationId, { type: 'undoMoveNode', id, oldParent, oldOrder, newParent, newOrder });
      
      setNodes(nodes => nodes.map(n => n.id === id ? { ...n, parent_node_id: oldParent, sort_order: oldOrder } : n));
      
      saveStateManager.markSaving(operationId);
      return moveNode(id, oldParent, oldOrder)
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to undo move:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => n.id === id ? { ...n, parent_node_id: newParent, sort_order: newOrder } : n));
          throw err;
        });
    }
  }),

  createBatchMoveCommand: (updates: { id: string, oldParent: string | null, oldOrder: number, newParent: string | null, newOrder: number }[]): Command => ({
    description: 'Batch Move Nodes',
    execute: () => {
      const operationId = `cmd-batch-move-${Date.now()}`;
      const oldStates = new Map<string, { parent_node_id: string | null, sort_order: number }>();
      
      saveStateManager.markPending(operationId, { type: 'batchMove', updates });
      
      setNodes(nodes => nodes.map(n => {
        const update = updates.find(u => u.id === n.id);
        if (update) {
          oldStates.set(n.id, { parent_node_id: n.parent_node_id, sort_order: n.sort_order });
          return { ...n, parent_node_id: update.newParent, sort_order: update.newOrder };
        }
        return n;
      }));
      
      const payload = updates.map(u => ({ id: u.id, parent_node_id: u.newParent, sort_order: u.newOrder }));
      saveStateManager.markSaving(operationId);
      return batchMoveNodes(payload)
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to batch move:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => {
            if (oldStates.has(n.id)) {
              const oldState = oldStates.get(n.id)!;
              return { ...n, ...oldState };
            }
            return n;
          }));
          throw err;
        });
    },
    undo: () => {
      const operationId = `undo-batch-move-${Date.now()}`;
      const currentStates = new Map<string, { parent_node_id: string | null, sort_order: number }>();
      
      saveStateManager.markPending(operationId, { type: 'undoBatchMove', updates });
      
      setNodes(nodes => nodes.map(n => {
        const update = updates.find(u => u.id === n.id);
        if (update) {
          currentStates.set(n.id, { parent_node_id: n.parent_node_id, sort_order: n.sort_order });
          return { ...n, parent_node_id: update.oldParent, sort_order: update.oldOrder };
        }
        return n;
      }));
      
      const payload = updates.map(u => ({ id: u.id, parent_node_id: u.oldParent, sort_order: u.oldOrder }));
      saveStateManager.markSaving(operationId);
      return batchMoveNodes(payload)
        .then(() => {
          saveStateManager.markSaved(operationId);
        })
        .catch(err => {
          console.error('Failed to undo batch move:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(nodes => nodes.map(n => {
            if (currentStates.has(n.id)) {
              const currentState = currentStates.get(n.id)!;
              return { ...n, ...currentState };
            }
            return n;
          }));
          throw err;
        });
    }
  }),

  createDeleteNodeCommand: (node: Node, descendants: Node[]): Command => {
    const allDeletedNodes = [node, ...descendants];
    
    const sortNodesTopDown = (nodes: Node[]): Node[] => {
      const idSet = new Set(nodes.map(n => n.id));
      const sorted: Node[] = [];
      const remaining = [...nodes];
      
      let changed = true;
      while (remaining.length > 0 && changed) {
        changed = false;
        for (let i = 0; i < remaining.length; i++) {
          const n = remaining[i];
          const parentInGroup = n.parent_node_id && idSet.has(n.parent_node_id);
          const parentRestored = parentInGroup ? sorted.some(s => s.id === n.parent_node_id) : true;
          
          if (parentRestored) {
            sorted.push(n);
            remaining.splice(i, 1);
            i--;
            changed = true;
          }
        }
      }
      return [...sorted, ...remaining];
    };

    const sortedForRestore = sortNodesTopDown(allDeletedNodes);

    return {
      description: 'Delete Node',
      execute: () => {
        const operationId = `cmd-delete-${node.id}-${Date.now()}`;
        const idsToDelete = allDeletedNodes.map(n => n.id);
        
        saveStateManager.markPending(operationId, { type: 'deleteNode', nodeId: node.id, allDeletedNodes });
        
        setNodes(nodes => nodes.filter(n => !idsToDelete.includes(n.id)));
        
        saveStateManager.markSaving(operationId);
        return deleteNode(node.id)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to delete node:', err);
            saveStateManager.markError(operationId, err.message);
            setNodes(prev => [...prev, ...sortedForRestore]);
            throw err;
          });
      },
      undo: () => {
        const operationId = `undo-delete-${node.id}-${Date.now()}`;
        saveStateManager.markPending(operationId, { type: 'undoDeleteNode', nodeId: node.id, allDeletedNodes: sortedForRestore });
        
        setNodes(prev => [...prev, ...sortedForRestore]);
        
        saveStateManager.markSaving(operationId);
        const promises = sortedForRestore.map(n => 
          createNode(n.document_id, n.content, n.parent_node_id, {
            id: n.id,
            sort_order: n.sort_order,
            note: n.note,
            is_completed: n.is_completed,
            is_collapsed: n.is_collapsed
          }).catch(err => {
            console.error('Failed to restore node:', err);
            return null;
          })
        );
        return Promise.all(promises)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to undo delete:', err);
            saveStateManager.markError(operationId, err.message);
            throw err;
          });
      }
    };
  },
  
  createBatchInsertCommand: (nodesToInsert: Node[]): Command => {
    const sortNodesTopDown = (nodes: Node[]): Node[] => {
      const idSet = new Set(nodes.map(n => n.id));
      const sorted: Node[] = [];
      const remaining = [...nodes];
      
      let changed = true;
      while (remaining.length > 0 && changed) {
        changed = false;
        for (let i = 0; i < remaining.length; i++) {
          const n = remaining[i];
          const parentInGroup = n.parent_node_id && idSet.has(n.parent_node_id);
          const parentRestored = parentInGroup ? sorted.some(s => s.id === n.parent_node_id) : true;
          
          if (parentRestored) {
            sorted.push(n);
            remaining.splice(i, 1);
            i--;
            changed = true;
          }
        }
      }
      return [...sorted, ...remaining];
    };
    
    const sortedNodes = sortNodesTopDown(nodesToInsert);
    const rootIds = sortedNodes.filter(n => !nodesToInsert.some(other => other.id === n.parent_node_id)).map(n => n.id);

    return {
      description: 'Batch Insert',
      execute: () => {
        setNodes(prev => [...prev, ...sortedNodes]);
        const promises = sortedNodes.map(n => 
          createNode(n.document_id, n.content, n.parent_node_id, {
            id: n.id,
            sort_order: n.sort_order,
            note: n.note,
            is_completed: n.is_completed,
            is_collapsed: n.is_collapsed
          }).catch(err => {
            console.error('Failed to insert node:', err);
            return null;
          })
        );
        return Promise.all(promises);
      },
      undo: () => {
        setNodes(prev => prev.filter(n => !nodesToInsert.some(inserted => inserted.id === n.id)));
        return batchDeleteNodes(rootIds).catch(err => {
          console.error('Failed to undo batch insert:', err);
          throw err;
        });
      }
    };
  },
  
  createBatchDeleteCommand: (nodesToDelete: Node[], allDescendants: Node[]): Command => {
    const allNodes = [...nodesToDelete, ...allDescendants];
    
    const sortNodesTopDown = (nodes: Node[]): Node[] => {
      const idSet = new Set(nodes.map(n => n.id));
      const sorted: Node[] = [];
      const remaining = [...nodes];
      
      let changed = true;
      while (remaining.length > 0 && changed) {
        changed = false;
        for (let i = 0; i < remaining.length; i++) {
          const n = remaining[i];
          const parentInGroup = n.parent_node_id && idSet.has(n.parent_node_id);
          const parentRestored = parentInGroup ? sorted.some(s => s.id === n.parent_node_id) : true;
          
          if (parentRestored) {
            sorted.push(n);
            remaining.splice(i, 1);
            i--;
            changed = true;
          }
        }
      }
      return [...sorted, ...remaining];
    };

    const sortedForRestore = sortNodesTopDown(allNodes);

    return {
      description: 'Batch Delete',
      execute: () => {
        const operationId = `cmd-batch-delete-${Date.now()}`;
        const ids = nodesToDelete.map(n => n.id);
        const allIds = allNodes.map(n => n.id);
        
        saveStateManager.markPending(operationId, { type: 'batchDelete', ids, allNodes });
        
        setNodes(prev => prev.filter(n => !allIds.includes(n.id)));
        
        saveStateManager.markSaving(operationId);
        return batchDeleteNodes(ids)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to batch delete:', err);
            saveStateManager.markError(operationId, err.message);
            setNodes(prev => [...prev, ...sortedForRestore]);
            throw err;
          });
      },
      undo: () => {
        const operationId = `undo-batch-delete-${Date.now()}`;
        saveStateManager.markPending(operationId, { type: 'undoBatchDelete', allNodes: sortedForRestore });
        
        setNodes(prev => [...prev, ...sortedForRestore]);
        
        saveStateManager.markSaving(operationId);
        const promises = sortedForRestore.map(n => 
          createNode(n.document_id, n.content, n.parent_node_id, {
            id: n.id,
            sort_order: n.sort_order,
            note: n.note,
            is_completed: n.is_completed,
            is_collapsed: n.is_collapsed
          }).catch(err => {
            console.error('Failed to restore node:', err);
            return null;
          })
        );
        return Promise.all(promises)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to undo batch delete:', err);
            saveStateManager.markError(operationId, err.message);
            throw err;
          });
      }
    };
  },

  createCreateNodeCommand: (nodeData: Partial<Node> & { document_id: string; content: string; parent_node_id: string | null; sort_order: number }): Command => {
    const nodeId = crypto.randomUUID();
    const newNode: Node = {
      id: nodeId,
      document_id: nodeData.document_id,
      content: nodeData.content,
      parent_node_id: nodeData.parent_node_id,
      sort_order: nodeData.sort_order,
      note: nodeData.note || '',
      is_completed: nodeData.is_completed || false,
      is_collapsed: nodeData.is_collapsed || false,
      is_todo: nodeData.is_todo || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as Node;

    return {
      description: 'Create Node',
      nodeId,
      execute: () => {
        const operationId = `cmd-create-${nodeId}-${Date.now()}`;
        saveStateManager.markPending(operationId, { type: 'createNode', nodeId, nodeData });

        setNodes(prev => [...prev, newNode]);

        saveStateManager.markSaving(operationId);
        return createNode(nodeData.document_id, nodeData.content, nodeData.parent_node_id, {
          id: nodeId,
          sort_order: nodeData.sort_order,
          note: nodeData.note,
          is_completed: nodeData.is_completed,
          is_collapsed: nodeData.is_collapsed,
          is_todo: nodeData.is_todo
        }).then(node => {
          saveStateManager.markSaved(operationId);
        }).catch(err => {
          console.error('Failed to create node:', err);
          saveStateManager.markError(operationId, err.message);
          setNodes(prev => prev.filter(n => n.id !== nodeId));
          throw err;
        });
      },
      undo: () => {
        const operationId = `undo-create-${nodeId}-${Date.now()}`;
        saveStateManager.markPending(operationId, { type: 'undoCreateNode', nodeId });
        
        setNodes(prev => prev.filter(n => n.id !== nodeId));
        
        saveStateManager.markSaving(operationId);
        return deleteNode(nodeId)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to undo create node:', err);
            saveStateManager.markError(operationId, err.message);
            throw err;
          });
      }
    };
  },

  createCompositeCommand: (commands: Command[], description?: string): Command => {
    return {
      description: description || 'Composite Command',
      execute: () => {
        const operationId = `cmd-composite-${Date.now()}`;
        saveStateManager.markPending(operationId, { type: 'composite', description, commandCount: commands.length });
        
        const promises = commands.map(cmd => cmd.execute());
        
        saveStateManager.markSaving(operationId);
        return Promise.all(promises)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to execute composite command:', err);
            saveStateManager.markError(operationId, err.message);
            throw err;
          });
      },
      undo: () => {
        const operationId = `undo-composite-${Date.now()}`;
        saveStateManager.markPending(operationId, { type: 'undoComposite', description, commandCount: commands.length });
        
        const promises = [];
        for (let i = commands.length - 1; i >= 0; i--) {
          promises.push(commands[i].undo());
        }
        
        saveStateManager.markSaving(operationId);
        return Promise.all(promises)
          .then(() => {
            saveStateManager.markSaved(operationId);
          })
          .catch(err => {
            console.error('Failed to undo composite command:', err);
            saveStateManager.markError(operationId, err.message);
            throw err;
          });
      }
    };
  }
});
