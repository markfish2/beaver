import api from './client';
import { dataCache } from './cache';

export interface ExcalidrawData {
  id: string;
  document_id: string;
  scene_data: string;
  thumbnail: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export class VersionConflictError extends Error {
  currentVersion: number;
  constructor(currentVersion: number) {
    super('Version conflict');
    this.currentVersion = currentVersion;
  }
}

/**
 * 获取画布数据
 */
export const getExcalidrawData = async (documentId: string): Promise<ExcalidrawData> => {
  const cacheKey = `excalidraw:${documentId}`;
  const cached = dataCache.get<ExcalidrawData>(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await api.get<ExcalidrawData>(`/excalidraw/${documentId}`);
  dataCache.set(cacheKey, response.data, 2 * 60 * 1000); // 2分钟缓存
  return response.data;
};

/**
 * 获取画布数据（跳过缓存，确保拿到最新版本）
 */
export const getExcalidrawDataFresh = async (documentId: string): Promise<ExcalidrawData> => {
  dataCache.invalidate(`excalidraw:${documentId}`);
  const response = await api.get<ExcalidrawData>(`/excalidraw/${documentId}`);
  dataCache.set(`excalidraw:${documentId}`, response.data, 2 * 60 * 1000);
  return response.data;
};

/**
 * 创建画布数据
 */
export const createExcalidrawData = async (documentId: string): Promise<ExcalidrawData> => {
  const response = await api.post<ExcalidrawData>('/excalidraw/', {
    document_id: documentId,
    scene_data: '{"elements":[]}',
  });
  dataCache.invalidate(`excalidraw:${documentId}`);
  return response.data;
};

/**
 * 更新画布数据（自动保存，带版本控制）
 * @throws VersionConflictError 版本冲突时抛出
 */
export const updateExcalidrawData = async (
  documentId: string,
  sceneData: string,
  version?: number
): Promise<ExcalidrawData> => {
  try {
    const response = await api.put<ExcalidrawData>(`/excalidraw/${documentId}`, {
      scene_data: sceneData,
      version: version ?? null,
    });
    dataCache.invalidate(`excalidraw:${documentId}`);
    return response.data;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      const detail = e.response.data?.detail;
      throw new VersionConflictError(detail?.current_version ?? 0);
    }
    throw e;
  }
};

/**
 * 删除画布数据
 */
export const deleteExcalidrawData = async (documentId: string): Promise<void> => {
  await api.delete(`/excalidraw/${documentId}`);
  dataCache.invalidate(`excalidraw:${documentId}`);
};

/**
 * 获取画布图片文件元数据
 */
export const getExcalidrawFilesMeta = async (documentId: string): Promise<Record<string, { mimeType: string; ext: string }>> => {
  try {
    const response = await api.get(`/excalidraw/${documentId}/files`);
    return response.data || {};
  } catch {
    return {};
  }
};

/**
 * 加载画布的所有图片文件，返回 Excalidraw files 对象。
 * 图片通过独立 API 按需加载为 dataUrl。
 */
export const loadExcalidrawFiles = async (documentId: string): Promise<Record<string, any>> => {
  const meta = await getExcalidrawFilesMeta(documentId);
  const fileIds = Object.keys(meta);
  if (fileIds.length === 0) return {};

  const token = localStorage.getItem('token');
  const files: Record<string, any> = {};

  // 并行加载所有图片（每批最多 5 个，避免并发过多）
  const batchSize = 5;
  for (let i = 0; i < fileIds.length; i += batchSize) {
    const batch = fileIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (fileId) => {
        const res = await fetch(`/api/excalidraw/${documentId}/files/${fileId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        return { fileId, dataUrl, mimeType: meta[fileId]?.mimeType || 'image/png' };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const { fileId, dataUrl, mimeType } = r.value;
        files[fileId] = {
          mimeType,
          id: fileId,
          dataURL: dataUrl,
          created: 0,
          lastRetrieved: 0,
        };
      }
    }
  }
  return files;
};

/**
 * 创建 excalidraw 文档（完整流程）
 */
export const createExcalidrawDocument = async (
  title: string = '无标题画布',
  parentId?: string | null
) => {
  // 1. 创建 document
  const { createDocument } = await import('./data');
  const doc = await createDocument(title, 'excalidraw', parentId, Date.now());

  // 2. 创建画布数据
  await createExcalidrawData(doc.id);

  return doc;
};
