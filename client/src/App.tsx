import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { setSessionExpiredHandler } from './services/api';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import EventDetailPage from './pages/EventDetailPage';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PollPage from './pages/PollPage';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  const { showActionToast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    setSessionExpiredHandler(() =>
      showActionToast(t('sessionExpired'), 'error', { label: t('login'), href: '/login' })
    );
  }, [showActionToast, t]);

  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/profile" element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } />
          <Route path="/event/:uuid" element={<EventDetailPage />} />
          <Route path="/poll/:uuid" element={<PollPage />} />
          <Route path="/" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
        </Routes>
      </div>
    </>
  );
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ToastProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ToastProvider>
      </LanguageProvider>
    </AuthProvider>
  );
};

export default App;
