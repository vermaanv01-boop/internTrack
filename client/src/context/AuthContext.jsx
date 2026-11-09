import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "../services";
import { getToken } from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => authService.getCurrentUser());
    const [token, setToken] = useState(() => getToken());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleUnauthorized = () => {
            setUser(null);
            setToken(null);
        };

        window.addEventListener("auth:unauthorized", handleUnauthorized);
        return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
    }, []);

    const login = useCallback(async (credentials) => {
        setLoading(true);
        try {
            const result = await authService.login(credentials);
            setUser(result.user);
            setToken(result.token);
            return result;
        } finally {
            setLoading(false);
        }
    }, []);

    const register = useCallback(async (credentials) => {
        setLoading(true);
        try {
            const result = await authService.register(credentials);
            return result;
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        setLoading(true);
        try {
            await authService.logout();
        } finally {
            setUser(null);
            setToken(null);
            setLoading(false);
        }
    }, []);

    const value = {
        user,
        token,
        isAuthenticated: Boolean(token && user),
        loading,
        login,
        register,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook export
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
