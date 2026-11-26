import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import { restoreSession } from './lib/api/sessionBootstrap';
import App from './App';
import './styles/globals.css';

// Try to restore the admin session from the refresh cookie before routes decide where to go.
void restoreSession();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
