import axios, { AxiosError } from 'axios';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TIMEOUT = 15000;

const api = axios.create({
  baseURL: '/api',
  timeout: TIMEOUT,
});

const retryQueue = new Map<string, number>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    const requestKey = `${response.config.method}-${response.config.url}`;
    retryQueue.delete(requestKey);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config;

    if (!config) {
      return Promise.reject(error);
    }

    const requestKey = `${config.method}-${config.url}`;
    const retryCount = retryQueue.get(requestKey) || 0;

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      return Promise.reject(error);
    }

    if (retryCount < MAX_RETRIES && (
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK' ||
      error.message.includes('timeout') ||
      error.message.includes('Network Error') ||
      (error.response?.status && error.response.status >= 500)
    )) {
      retryQueue.set(requestKey, retryCount + 1);
      await sleep(RETRY_DELAY * (retryCount + 1));
      return api.request(config);
    }

    retryQueue.delete(requestKey);
    return Promise.reject(error);
  }
);

export default api;
