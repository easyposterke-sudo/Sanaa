import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyThemeToDocument, getInitialTheme } from './hooks/useTheme'

// Suppress known Three.js HDR loader uncaught rejection when an HDR file is invalid
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message ?? String(event.reason ?? '')
    if (msg.includes("reading 'image'") && event.reason?.stack?.includes('onLoad')) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, { capture: true, once: false })
}

applyThemeToDocument(getInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
