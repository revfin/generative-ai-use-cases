import './i18n/config';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWithUserpool from './components/AuthWithUserpool';
import AuthWithSAML from './components/AuthWithSAML';
import './index.css';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  RouteObject,
} from 'react-router-dom';
import Setting from './pages/Setting';
import ChatPage from './pages/ChatPage';
import SharedChatPage from './pages/SharedChatPage';
import NotFound from './pages/NotFound';
import { Authenticator } from '@aws-amplify/ui-react';
import App from './App.tsx';
import { Toaster } from 'sonner';

const samlAuthEnabled: boolean =
  import.meta.env.VITE_APP_SAMLAUTH_ENABLED === 'true';

// Mimir is a single-purpose chat app: the only destinations are the chat
// itself (new / by id / shared) and settings. Every other GenU use case is
// intentionally unrouted so it tree-shakes out of the bundle.
const routes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to="/chat" replace />,
  },
  {
    path: '/chat',
    element: <ChatPage />,
  },
  {
    path: '/chat/:chatId',
    element: <ChatPage />,
  },
  {
    path: '/share/:shareId',
    element: <SharedChatPage />,
  },
  {
    path: '/setting',
    element: <Setting />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

const router = createBrowserRouter([
  {
    path: '/',
    element: samlAuthEnabled ? (
      <AuthWithSAML>
        <App />
      </AuthWithSAML>
    ) : (
      <AuthWithUserpool>
        <App />
      </AuthWithUserpool>
    ),
    children: routes,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
    <React.Suspense fallback={<div>Loading...</div>}>
      <Authenticator.Provider>
        <RouterProvider router={router} />
        <Toaster />
      </Authenticator.Provider>
    </React.Suspense>
  </React.StrictMode>
);
