import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import PublicLayout from './components/PublicLayout';
import { AuthProvider } from './context/AuthContext';
import Compose from './pages/Compose';
import ForgotPassword from './pages/ForgotPassword';
import History from './pages/History';
import Insights from './pages/Insights';
import Knowledge from './pages/Knowledge';
import Landing from './pages/Landing';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Reminders from './pages/Reminders';
import Reply from './pages/Reply';
import ResetPassword from './pages/ResetPassword';
import Signup from './pages/Signup';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public pages: top header + footer */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Logged-in only: sidebar layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/app" element={<Compose />} />
              <Route path="/app/reply" element={<Reply />} />
              <Route path="/app/history" element={<History />} />
              <Route path="/app/reminders" element={<Reminders />} />
              <Route path="/app/insights" element={<Insights />} />
              <Route path="/app/knowledge" element={<Knowledge />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
