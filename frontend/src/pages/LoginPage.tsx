import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { setServerUrl, getServerUrl } from '../api/client';
import { saveToNative } from '../utils/nativeBridge';

const LoginPage = () => {
  const [serverAddress, setServerAddress] = useState(() => getServerUrl() || 'https://beaver.arcbox.top');
  const [step, setStep] = useState<'server' | 'login'>(() => (getServerUrl() || 'https://beaver.arcbox.top') ? 'login' : 'server');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isSetupRequired, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isSetupRequired === true) {
      navigate('/setup');
    }
  }, [isSetupRequired, isLoading, navigate]);

  // 已登录用户误入登录页，直接跳转首页
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let url = serverAddress.trim();
    if (!url) {
      setError('请输入服务器地址');
      return;
    }

    // 自动补全 https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // 强制使用 https（避免 Mixed Content 错误）
    url = url.replace('http://', 'https://');

    // 移除末尾的 /
    url = url.replace(/\/+$/, '');

    setServerUrl(url);
    setServerAddress(url);

    // 同步到原生 SharedPreferences（小组件使用）
    saveToNative('serverUrl', url);

    setStep('login');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(username, password);
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('Network Error')) {
        setError('无法连接到服务器，请检查地址是否正确');
        setStep('server');
      } else {
        setError(err.response?.data?.detail || '用户名或密码错误');
      }
    }
  };

  const handleChangeServer = () => {
    setStep('server');
    setError('');
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbfbf9] dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/beaver.png"
            alt="Beaver"
            className="w-16 h-16 mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Beaver</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {step === 'server' ? '连接到你的知识库' : '登录到你的知识库'}
          </p>
        </div>

        {step === 'server' ? (
          /* Server Address Form */
          <form onSubmit={handleServerSubmit} className="space-y-4">
            <div>
              <input
                type="url"
                required
                autoFocus
                className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                placeholder="服务器地址，例如 https://beaver.example.com"
                value={serverAddress}
                onChange={(e) => setServerAddress(e.target.value)}
              />
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                输入你的 Beaver 服务器地址
              </p>
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 py-2 px-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              连接
            </button>
          </form>
        ) : (
          /* Login Form */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {/* Server indicator */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">
                {serverAddress}
              </span>
              <button
                type="button"
                onClick={handleChangeServer}
                className="text-xs text-blue-500 hover:text-blue-600 ml-2 shrink-0"
              >
                更换
              </button>
            </div>

            <div>
              <input
                type="text"
                required
                autoComplete="username"
                autoFocus
                className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 py-2 px-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              登录
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
