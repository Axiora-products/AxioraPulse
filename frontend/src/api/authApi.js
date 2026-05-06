import API from "./axios";

export const loginUser = async (data) => {
    const res = await API.post("/auth/login", data);
    return res.data;
};

export const registerUser = async (data) => {
    const res = await API.post("/auth/register", data);
    return res.data;
};

export const requestResetPassword = async (email) => {
    const res = await API.post("/auth/reset-password-request", { email });
    return res.data;
};