import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import ShareViewer from './ShareViewer.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ShareViewer />
  </StrictMode>,
);
