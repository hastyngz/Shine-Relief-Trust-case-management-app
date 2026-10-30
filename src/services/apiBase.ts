const configuredApiUrl = typeof import.meta.env === 'object' ? import.meta.env.VITE_R2_API_URL : '';

export const API_BASE_URL = (configuredApiUrl || '').replace(/\/$/, '');