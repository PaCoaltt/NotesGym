import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkUserAuth();
    const expired = () => {
      setUser(null);
      setIsAuthenticated(false);
      queryClientInstance.cancelQueries().then(() => queryClientInstance.clear());
    };
    window.addEventListener('notesgym:session-expired', expired);
    return () => window.removeEventListener('notesgym:session-expired', expired);
  }, []);

  const checkAppState = async () => {
    await checkUserAuth();
  };

  const checkUserAuth = async (silent = false) => {
    try {
      if (!silent) setIsLoadingAuth(true);
      setAuthError(null);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      await queryClientInstance.cancelQueries();
      queryClientInstance.clear();
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const result = await base44.auth.login(email, password);
      await queryClientInstance.cancelQueries();
      queryClientInstance.clear();
      setUser(result.user);
      setIsAuthenticated(true);
      return result.user;
    } catch (error) {
      setAuthError({
        type: 'invalid_credentials',
        message: error.message || 'Invalid email or password'
      });
      throw error;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    await base44.auth.logout();
    await queryClientInstance.cancelQueries();
    queryClientInstance.clear();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      login,
      logout,
      navigateToLogin,
      checkAppState,
      checkUserAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
