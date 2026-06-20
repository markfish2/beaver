import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { getAIConfigs, createAIConfig, updateAIConfig, deleteAIConfig, testAIConfig, type AIConfig, type AIConfigCreate } from '../api/data';

// 预设配置
const PRESETS: Record<string, { name: string; api_url: string; model: string }> = {
  deepseek: { name: 'DeepSeek', api_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { name: 'OpenAI', api_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  gemini: { name: 'Gemini', api_url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  qwen: { name: '通义千问', api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  mimo: { name: 'MiMo', api_url: 'https://api.moonshot.cn/v1', model: 'kimi-latest' },
};

interface AISettingsProps {
  onClose: () => void;
}

export default function AISettings({ onClose }: AISettingsProps) {
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  const [form, setForm] = useState<AIConfigCreate>({
    name: '',
    provider: 'custom',
    api_url: '',
    api_key: '',
    model: '',
    is_default: false
  });

  const fetchConfigs = useCallback(async () => {
    try {
      const data = await getAIConfigs();
      setConfigs(data);
    } catch (e) {
      console.error('获取 AI 配置失败', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (preset) {
      setForm(prev => ({ ...prev, ...preset, provider: key }));
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.api_url || !form.api_key || !form.model) return;
    try {
      if (editingId) {
        await updateAIConfig(editingId, form);
      } else {
        await createAIConfig(form);
      }
      setShowAdd(false);
      setEditingId(null);
      setForm({ name: '', provider: 'custom', api_url: '', api_key: '', model: '', is_default: false });
      fetchConfigs();
    } catch (e) {
      console.error('保存失败', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAIConfig(id);
      fetchConfigs();
    } catch (e) {
      console.error('删除失败', e);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await testAIConfig(id);
      setTestResult({ id, ...result });
    } catch {
      setTestResult({ id, ok: false, message: '请求失败' });
    } finally {
      setTesting(null);
    }
  };

  const handleEdit = (config: AIConfig) => {
    setEditingId(config.id);
    setForm({
      name: config.name,
      provider: config.provider,
      api_url: config.api_url,
      api_key: config.api_key,
      model: config.model,
      is_default: config.is_default
    });
    setShowAdd(true);
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updateAIConfig(id, { is_default: true });
      fetchConfigs();
    } catch (e) {
      console.error('设置默认失败', e);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex flex-col w-[90vw] max-w-[560px] max-h-[80vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI 模型配置</span>
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', provider: 'custom', api_url: '', api_key: '', model: '', is_default: false }); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 添加
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8 text-gray-400">加载中...</div>
          ) : configs.length === 0 && !showAdd ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-3">还没有配置 AI 模型</p>
              <p className="text-xs text-gray-400">添加配置后即可使用 AI 整理功能</p>
            </div>
          ) : null}

          {configs.map(config => (
            <div key={config.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{config.name}</span>
                  {config.is_default && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">默认</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!config.is_default && (
                    <button onClick={() => handleSetDefault(config.id)} className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-1">设为默认</button>
                  )}
                  <button onClick={() => handleEdit(config)} className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-1">编辑</button>
                  <button onClick={() => handleDelete(config.id)} className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1">删除</button>
                </div>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5">
                <div>模型: {config.model}</div>
                <div>接口: {config.api_url}</div>
              </div>
              <div className="mt-2">
                <button
                  onClick={() => handleTest(config.id)}
                  disabled={testing === config.id}
                  className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {testing === config.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '测试连接'}
                </button>
                {testResult && testResult.id === config.id && (
                  <span className={`ml-2 text-xs ${testResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          ))}

          {showAdd && (
            <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {editingId ? '编辑配置' : '添加配置'}
              </div>

              {!editingId && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">快速填充预设</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => applyPreset(key)}
                        className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">名称</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如 DeepSeek" className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">模型</label>
                  <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="如 deepseek-chat" className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">API URL</label>
                <input value={form.api_url} onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))} placeholder="https://api.deepseek.com/v1" className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">API Key</label>
                <input value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="sk-..." type="password" className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
                <label htmlFor="is_default" className="text-xs text-gray-500">设为默认</label>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm transition-colors">
                  <Check className="w-4 h-4" /> 保存
                </button>
                <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm transition-colors">
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button onClick={onClose} className="w-full px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
