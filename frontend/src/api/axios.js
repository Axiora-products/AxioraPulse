import axios from "axios";

const API = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

// Attach Bearer token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

API.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem("token");
            // Skip redirect for auth init paths — initialize() catch handles them gracefully,
            // preventing expired-token users from being bounced off public routes like /s/:slug
            const url = err.config?.url || '';
            if (!url.includes('/auth/me') && !url.includes('/auth/sync')) {
                window.location.href = "/login";
            }
        }
        if (err.response?.status === 403) {
            const detail = err.response?.data?.detail || '';
            if (detail.toLowerCase().includes('upgrade') || detail.toLowerCase().includes('limit reached')) {
                import('../hooks/usePaymentWall').then(({ default: usePaymentWall }) => {
                    usePaymentWall.getState().show(detail);
                });
            }
        }
        return Promise.reject(err);
    }
);

export default API;