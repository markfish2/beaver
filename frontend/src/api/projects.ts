import api from './client';

// ==================== Types ====================

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  start_date: string;
  end_date: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
  children: Task[];
}

export interface Project {
  id: string;
  name: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tasks?: Task[];
}

// ==================== Projects ====================

export const getProjects = async (): Promise<Project[]> => {
  const res = await api.get('/projects/');
  return res.data;
};

export const getArchivedProjects = async (): Promise<Project[]> => {
  const res = await api.get('/projects/archived');
  return res.data;
};

export const createProject = async (name: string): Promise<Project> => {
  const res = await api.post('/projects/', { name });
  return res.data;
};

export const updateProject = async (id: string, data: Partial<Project>): Promise<Project> => {
  const res = await api.put(`/projects/${id}`, data);
  return res.data;
};

export const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`);
};

export const archiveProject = async (id: string): Promise<Project> => {
  const res = await api.put(`/projects/${id}/archive`);
  return res.data;
};

export const unarchiveProject = async (id: string): Promise<Project> => {
  const res = await api.put(`/projects/${id}/unarchive`);
  return res.data;
};

export const reorderProjects = async (ids: string[]): Promise<void> => {
  await api.put('/projects/reorder', { ids });
};

// ==================== Tasks ====================

export const getTasks = async (projectId: string): Promise<Task[]> => {
  const res = await api.get(`/projects/${projectId}/tasks`);
  return res.data;
};

export const createTask = async (projectId: string, data: {
  title: string;
  start_date: string;
  end_date: string;
  parent_id?: string | null;
  sort_order?: number;
}): Promise<Task> => {
  const res = await api.post(`/tasks/${projectId}`, data);
  return res.data;
};

export const updateTask = async (taskId: string, data: Partial<Task>): Promise<Task> => {
  const res = await api.put(`/tasks/${taskId}`, data);
  return res.data;
};

export const deleteTask = async (taskId: string): Promise<void> => {
  await api.delete(`/tasks/${taskId}`);
};

export const toggleTask = async (taskId: string): Promise<Task> => {
  const res = await api.put(`/tasks/${taskId}/toggle`);
  return res.data;
};

export const reorderTasks = async (items: { id: string; sort_order: number; parent_id?: string | null }[]): Promise<void> => {
  await api.put('/tasks/reorder', { items });
};
