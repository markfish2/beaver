/**
 * 模式选择页面
 *
 * 首次打开 APP 时显示，让用户选择：
 * 1. 纯本地模式 - 数据存储在设备上，无需服务器
 * 2. 连接云端模式 - 连接远程服务器，数据同步到云端
 */

import { useState } from 'react';
import { HardDrive, Cloud, ArrowRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { DataMode } from '../data/provider';

export default function ModeSelectPage() {
  const { switchMode } = useData();
  const [selectedMode, setSelectedMode] = useState<DataMode>('local');
  const [serverUrl, setServerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    setLoading(true);
    setError('');

    try {
      if (selectedMode === 'remote' && !serverUrl.trim()) {
        setError('请输入服务器地址');
        setLoading(false);
        return;
      }

      await switchMode(selectedMode, serverUrl.trim() || undefined);
    } catch (e: any) {
      setError(e.message || '连接失败，请检查服务器地址');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <span className="text-4xl">🦫</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">欢迎使用 Beaver</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">选择你的使用方式</p>
      </div>

      {/* Mode Cards */}
      <div className="w-full max-w-md space-y-4 mb-8">
        {/* 本地模式 */}
        <button
          onClick={() => setSelectedMode('local')}
          className={`w-full p-5 rounded-xl border-2 transition-all text-left ${
            selectedMode === 'local'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              selectedMode === 'local'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            }`}>
              <HardDrive size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">纯本地模式</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                数据存储在设备上，无需网络和服务器，完全离线使用
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  离线可用
                </span>
                <span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                  数据隐私
                </span>
                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  无需注册
                </span>
              </div>
            </div>
          </div>
        </button>

        {/* 云端模式 */}
        <button
          onClick={() => setSelectedMode('remote')}
          className={`w-full p-5 rounded-xl border-2 transition-all text-left ${
            selectedMode === 'remote'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              selectedMode === 'remote'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            }`}>
              <Cloud size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">连接云端</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                连接远程服务器，数据自动同步，支持多设备访问
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  多端同步
                </span>
                <span className="px-2 py-1 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  云端备份
                </span>
                <span className="px-2 py-1 text-xs rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400">
                  分享协作
                </span>
              </div>
            </div>
          </div>
        </button>

        {/* 服务器地址输入 */}
        {selectedMode === 'remote' && (
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              服务器地址
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://your-server.com"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              输入你的 Beaver 服务器地址，例如：https://beaver.example.com
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-md mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Continue Button */}
      <button
        onClick={handleContinue}
        disabled={loading}
        className="w-full max-w-md py-4 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            继续
            <ArrowRight size={18} />
          </>
        )}
      </button>

      {/* Footer */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
        你可以随时在设置中切换模式
      </p>
    </div>
  );
}
