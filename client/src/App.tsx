import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Contacts from './pages/Contacts';
import Mandates from './pages/Mandates';
import Messages from './pages/Messages';
import InboxPage from './pages/Inbox';
import Segments from './pages/Segments';
import CampaignBuilder from './pages/CampaignBuilder';
import Workflows from './pages/Workflows';
import Forms from './pages/Forms';
import Attribution from './pages/Attribution';
import FormPublic from './pages/FormPublic';
import Ads from './pages/Ads';
import Social from './pages/Social';
import MessageTemplates from './pages/MessageTemplates';
import AIAgent from './pages/AIAgent';
import Layout from './components/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute>
                <Layout>
                  <Campaigns />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts"
            element={
              <ProtectedRoute>
                <Layout>
                  <Contacts />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <Layout>
                  <Messages />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/segments"
            element={
              <ProtectedRoute>
                <Layout>
                  <Segments />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns/builder"
            element={
              <ProtectedRoute>
                <Layout>
                  <CampaignBuilder />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <Layout>
                  <InboxPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          {/* Public form page — no auth, no layout */}
          <Route path="/f/:id" element={<FormPublic />} />

          <Route
            path="/workflows"
            element={
              <ProtectedRoute>
                <Layout>
                  <Workflows />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attribution"
            element={
              <ProtectedRoute>
                <Layout>
                  <Attribution />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/forms"
            element={
              <ProtectedRoute>
                <Layout>
                  <Forms />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/templates"
            element={
              <ProtectedRoute>
                <Layout>
                  <MessageTemplates />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/social"
            element={
              <ProtectedRoute>
                <Layout>
                  <Social />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ads"
            element={
              <ProtectedRoute>
                <Layout>
                  <Ads />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/mandates"
            element={
              <ProtectedRoute>
                <Layout>
                  <Mandates />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agent"
            element={
              <ProtectedRoute>
                <Layout>
                  <AIAgent />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
