import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import PostList from './pages/PostList.tsx';
import PostPage from './pages/PostPage.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<PostList />} />
          <Route path="posts/:slug" element={<PostPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>
);