import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { PipefyAppProvider } from './sdk/PipefyAppContext';
import { PipeViewPage } from './routes/PipeViewPage';
import { RootInit } from './routes/RootInit';
import { SidebarPage } from './routes/SidebarPage';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootInit />,
  },
  {
    path: '/pipe-view',
    element: <PipeViewPage />,
  },
  {
    path: '/sidebar',
    element: <SidebarPage />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PipefyAppProvider>
      <RouterProvider router={router} />
    </PipefyAppProvider>
  </React.StrictMode>
);
