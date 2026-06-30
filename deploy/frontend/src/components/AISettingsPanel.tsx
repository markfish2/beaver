import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, Loader2, Sparkles, Database } from 'lucide-react';
import { getAIConfigs, createAIConfig, updateAIConfig, deleteAIConfig, testAIConfig, reindexEmbeddings, getReindexStatus, type AIConfig, type AIConfigCreate, type ReindexStatus } from '../api/data';
import { showToast } from '../utils/toast';

// 预设配置 - Chat 模型
const CHAT_PRESETS: Record<string, { name: string; api_url: string; model: string }> = {
  deepseek: { name: 'DeepSeek', api_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { name: 'OpenAI', api_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  gemini: { name: 'Gemini', api_url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  qwen: { name: '通义千问', api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  mimo: { name: 'MiMo', api_url: 'https://api.moonshot.cn/v1', model: 'kimi-latest' },
};

// 预设配置 - Embedding 模型
const EMBEDDING_PRESETS: Record<string, { name: string; api_url: string; model: string }> = {
  siliconflow: { name: '硅基流动', api_url: 'https://api.siliconflow.cn/v1', model: 'BAAI/bge-m3' },
  openai_emb: { name: 'OpenAI', api_url: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
};

export default function AISettingsPanel() {
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [embeddingSupport, setEmbeddingSupport] = useState<Record<string, boolean>>({});
  const [reindexStatus, setReindexStatus] = useState<ReindexStatus | null>(null);

  const [form, setForm] = useState<AIConfigCreate>({
    name: '',
    provider: 'custom',
    api_url: '',
    api_key: '',
    model: '',
    purpose: 'chat',
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

  // 检测每个配置的 embedding 支持
  const checkEmbedding = useCallback(async (configId: string) => {
    try {
      const resp = await fetch(`/api/ai/configs/${configId}/embedding-support`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setEmbeddingSupport(prev => ({ ...prev, [configId]: data.supported }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    configs.forEach(c => checkEmbedding(c.id));
  }, [configs, checkEmbedding]);

  const applyPreset = (key: string, presetGroup: Record<string, { name: string; api_url: string; model: string }>, purpose: string) => {
    const preset = presetGroup[key];
    if (preset) {
      setForm(prev => ({ ...prev, ...preset, provider: key, purpose }));
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
      setForm({ name: '', provider: 'custom', api_url: '', api_key: '', model: '', purpose: 'chat', is_default: false });
      fetchConfigs();
      showToast('配置已保存');
    } catch (e) {
      console.error('保存失败', e);
      showToast('保存失败', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAIConfig(id);
      fetchConfigs();
      showToast('配置已删除');
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
      purpose: config.purpose || 'chat',
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

  // 轮询索引进度
  useEffect(() => {
    if (!reindexStatus?.running) return;
    const interval = setInterval(async () => {
      try {
        const status = await getReindexStatus();
        setReindexStatus(status);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [reindexStatus?.running]);

  const handleReindex = async () => {
    try {
      await reindexEmbeddings();
      // 开始轮询
      setReindexStatus({ running: true, memos_indexed: 0, docs_indexed: 0, memos_skipped: 0, docs_skipped: 0, errors: 0, total_memos: 0, total_docs: 0, current: '启动中...', done: false, message: '' });
      showToast('索引任务已启动');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '索引失败';
      showToast(msg, 'error');
    }
  };

  const chatConfigs = configs.filter(c => (c.purpose || 'chat') === 'chat');
  const embeddingConfigs = configs.filter(c => c.purpose === 'embedding');

  const renderConfigCard = (config: AIConfig) => (
    <div key={config.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
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
        {(config.purpose || 'chat') === 'chat' && (
          <div className="flex items-center gap-1 mt-1">
            {embeddingSupport[config.id] === undefined ? (
              <span className="text-gray-300">检测中...</span>
            ) : embeddingSupport[config.id] ? (
              <span className="text-green-500">✓ 支持向量搜索</span>
            ) : (
              <span className="text-yellow-500">⚠ 仅关键词搜索</span>
            )}
          </div>
        )}
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
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Chat 模型配置 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              对话模型
            </h2>
            <button
              onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', provider: 'custom', api_url: '', api_key: '', model: '', purpose: 'chat', is_default: false }); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400">加载中...</div>
          ) : chatConfigs.length === 0 && !showAdd ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-3">还没有配置对话模型</p>
              <p className="text-xs text-gray-400">添加 DeepSeek、OpenAI 等配置后即可使用 AI 整理功能</p>
            </div>
          ) : (
            <div className="space-y-3">
              {chatConfigs.map(config => renderConfigCard(config))}
            </div>
          )}
        </div>

        {/* Embedding 模型配置 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Database className="w-5 h-5" />
              向量模型
              <span className="text-xs font-normal text-gray-400">（用于语义搜索）</span>
            </h2>
            <button
              onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', provider: 'custom', api_url: '', api_key: '', model: '', purpose: 'embedding', is_default: false }); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>

          {embeddingConfigs.length === 0 && !showAdd ? (
            <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <p className="text-sm text-gray-400 mb-1">还没有配置向量模型</p>
              <p className="text-xs text-gray-400">配置后可使用语义搜索（比关键词搜索更智能）</p>
            </div>
          ) : (
            <div className="space-y-3">
              {embeddingConfigs.map(config => renderConfigCard(config))}
              {/* 索引进度 */}
              {reindexStatus?.running && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">{reindexStatus.current}</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, ((reindexStatus.memos_indexed + reindexStatus.docs_indexed + reindexStatus.memos_skipped + reindexStatus.docs_skipped) / Math.max(1, reindexStatus.total_memos + reindexStatus.total_docs)) * 100)}%`
                      }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>随想: {reindexStatus.memos_indexed}/{reindexStatus.total_memos}</span>
                    <span>文档: {reindexStatus.docs_indexed}/{reindexStatus.total_docs}</span>
                    {reindexStatus.errors > 0 && <span className="text-red-500">错误: {reindexStatus.errors}</span>}
                  </div>
                </div>
              )}

              {/* 索引完成 */}
              {reindexStatus?.done && !reindexStatus.running && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300">{reindexStatus.message}</p>
                </div>
              )}

              <button
                onClick={handleReindex}
                disabled={reindexStatus?.running}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {reindexStatus?.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                {reindexStatus?.running ? '索引中...' : '重建索引'}
              </button>
            </div>
          )}
        </div>

        {/* 添加/编辑表单 */}
        {showAdd && (
          <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {editingId ? '编辑配置' : `添加${form.purpose === 'embedding' ? '向量' : '对话'}模型`}
            </div>

            {!editingId && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">快速填充预设</label>
                <div className="flex flex-wrap gap-1.5">
                  {form.purpose === 'embedding'
                    ? Object.entries(EMBEDDING_PRESETS).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => applyPreset(key, EMBEDDING_PRESETS, 'embedding')}
                          className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          {preset.name}
                        </button>
                      ))
                    : Object.entries(CHAT_PRESETS).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => applyPreset(key, CHAT_PRESETS, 'chat')}
                          className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          {preset.name}
                        </button>
                      ))
                  }
                </div>
              </div>
            )}

            <div className="space-y-2">
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="配置名称"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                type="text"
                value={form.api_url}
                onChange={e => setForm({ ...form, api_url: e.target.value })}
                placeholder="API 地址"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                type="password"
                value={form.api_key}
                onChange={e => setForm({ ...form, api_key: e.target.value })}
                placeholder="API Key"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                type="text"
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="模型名称"
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {form.purpose === 'chat' && (
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={e => setForm({ ...form, is_default: e.target.checked })}
                    className="rounded"
                  />
                  设为默认配置
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowAdd(false); setEditingId(null); }}
                className="flex-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name || !form.api_url || !form.api_key || !form.model}
                className="flex-1 px-3 py-2 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {editingId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
