import { request, setAuthSession, clearAuthSession, getStoredUser } from "./api";

export const authService = {
    async register({ name, email, password }) {
        return request("/users/register", {
            method: "POST",
            body: { name, email, password },
        });
    },

    async login({ email, password }) {
        const data = await request("/users/login", {
            method: "POST",
            body: { email, password },
        });
        if (data.token) {
            setAuthSession(data.token, data.user);
        }
        return data;
    },

    async logout() {
        try {
            await request("/users/logout", { method: "POST" });
        } catch {
            // Ignore error on logout
        } finally {
            clearAuthSession();
        }
    },

    async updateProfile(id, payload) {
        return request(`/users/update/${id}`, {
            method: "PUT",
            body: payload,
        });
    },

    getCurrentUser() {
        return getStoredUser();
    },
};

export const analyticsService = {
    async getDashboardAnalytics() {
        return request("/analytics/dashboard");
    },
};

export const applicationService = {
    async list(params = {}) {
        return request("/applications", { params });
    },

    async getById(id) {
        return request(`/applications/${id}`);
    },

    async create(payload) {
        return request("/applications", {
            method: "POST",
            body: payload,
        });
    },

    async update(id, payload) {
        return request(`/applications/${id}`, {
            method: "PUT",
            body: payload,
        });
    },

    async delete(id) {
        return request(`/applications/${id}`, {
            method: "DELETE",
        });
    },
};

export const resumeService = {
    async list() {
        return request("/resumes");
    },

    async getById(id) {
        return request(`/resumes/${id}`);
    },

    async upload(file) {
        const formData = new FormData();
        formData.append("resume", file);
        return request("/resumes", {
            method: "POST",
            body: formData,
            isFormData: true,
        });
    },

    async activate(id) {
        return request(`/resumes/${id}/activate`, {
            method: "PATCH",
        });
    },

    async delete(id) {
        return request(`/resumes/${id}`, {
            method: "DELETE",
        });
    },

    async download(id) {
        return request(`/resumes/${id}/download`, {
            responseType: "blob",
        });
    },
};

export const matchingService = {
    async analyze({ resumeId, jobDescription, jobTitle, company }) {
        return request("/matching/analyze", {
            method: "POST",
            body: { resumeId, jobDescription, jobTitle, company },
        });
    },

    async getHistory(params = {}) {
        return request("/matching/history", { params });
    },

    async getHistoryById(id) {
        return request(`/matching/history/${id}`);
    },

    async deleteHistory(id) {
        return request(`/matching/history/${id}`, {
            method: "DELETE",
        });
    },
};

export const interviewPrepService = {
    async generate({ resumeId, jobDescription, jobTitle, company, difficulty }) {
        return request("/interview-prep/generate", {
            method: "POST",
            body: { resumeId, jobDescription, jobTitle, company, difficulty },
        });
    },

    async start(id) {
        return request(`/interview-prep/${id}/start`, {
            method: "POST",
        });
    },

    async submitAnswer(id, { questionId, answer }) {
        return request(`/interview-prep/${id}/answer`, {
            method: "POST",
            body: { questionId, answer },
        });
    },

    async complete(id) {
        return request(`/interview-prep/${id}/complete`, {
            method: "POST",
        });
    },

    async getHistory(params = {}) {
        return request("/interview-prep/history", { params });
    },

    async getById(id) {
        return request(`/interview-prep/history/${id}`);
    },

    async delete(id) {
        return request(`/interview-prep/history/${id}`, {
            method: "DELETE",
        });
    },
};
