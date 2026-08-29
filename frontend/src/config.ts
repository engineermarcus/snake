// Resolve Backend API & WebSocket URLs from environment variables
const ENV_HTTP_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const ENV_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';

export const SERVER_HTTP_URL = ENV_HTTP_URL;
export const SERVER_WS_URL = ENV_WS_URL;

export const BALL_COLOR = '#ef4444';
export const AVAILABLE_COLORS = [
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#d946ef', '#f59e0b', '#14b8a6', '#eab308',
  '#38ef7d', '#00f2fe', '#f9d423', '#a8ff78'
];
