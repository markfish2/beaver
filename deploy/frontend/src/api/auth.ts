import api from './client';

export interface User {
  id: string;
  username: string;
  theme: string;
  font_family: string;
  font_size: string;
  memo_columns: number;
  nickname?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar_path?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export const checkSetupStatus = async () => {
  const response = await api.get<{ setup_required: boolean }>('/auth/setup/status');
  return response.data;
};

export const setupAdmin = async (username: string, password: string) => {
  const response = await api.post<User>('/auth/setup', { username, password });
  return response.data;
};

export const login = async (username: string, password: string) => {
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  
  const response = await api.post<AuthResponse>('/auth/token', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get<User>('/users/me');
  return response.data;
};

export const updateSettings = async (settings: { theme?: string; font_family?: string; font_size?: string; memo_columns?: number }) => {
  const response = await api.put<User>('/users/settings', settings);
  return response.data;
};

export const updateProfile = async (profile: { nickname?: string; email?: string; phone?: string; bio?: string; avatar_path?: string }) => {
  const response = await api.put<User>('/users/profile', profile);
  return response.data;
};
