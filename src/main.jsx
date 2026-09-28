import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import LanguageProvider from './components/LanguageProvider.jsx'
import './index.css'

// Above the PIN gate on purpose: the sign-in screen is the first thing a
// Spanish-speaking employee sees, so the language has to be switchable before
// anyone is signed in.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
)
