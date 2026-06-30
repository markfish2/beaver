import type { Node } from '../api/data';

export interface Command {
  execute: () => Promise<void>;
  undo: () => Promise<void>;
  description?: string;
  nodeId?: string;
}

export type CommandFactory = {
  createUpdateContentCommand: (id: string, oldContent: string, newContent: string) => Command;
  createUpdateNoteCommand: (id: string, oldNote: string, newNote: string) => Command;
  createTogglePropertyCommand: (id: string, property: 'is_completed' | 'is_in_progress' | 'is_collapsed', newValue: boolean) => Command;
  createMoveNodeCommand: (id: string, oldParent: string | null, oldOrder: number, newParent: string | null, newOrder: number) => Command;
  createBatchMoveCommand: (updates: { id: string, oldParent: string | null, oldOrder: number, newParent: string | null, newOrder: number }[]) => Command;
  createDeleteNodeCommand: (node: Node, descendants: Node[]) => Command;
  createBatchDeleteCommand: (nodes: Node[], allDescendants: Node[]) => Command;
  createBatchInsertCommand: (nodesToInsert: Node[]) => Command;
  createCreateNodeCommand: (nodeData: Partial<Node> & { document_id: string; content: string; parent_node_id: string | null; sort_order: number }) => Command;
  createCompositeCommand: (commands: Command[], description?: string) => Command;
};
