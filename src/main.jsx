import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --surface-0: #f8f7fc;
    --surface-card: #ffffff;
    --surface-nav: #ffffff;
    --surface-input: #f5f4fb;
    --bg-story: #120f28;
    --text-primary: #1a1830;
    --text-secondary: #5a5675;
    --text-muted: #9b97b5;
    --border: rgba(83,74,183,0.14);
    --border-strong: rgba(83,74,183,0.25);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --surface-0: #0f0e1a;
      --surface-card: #1a1830;
      --surface-nav: #16142b;
      --surface-input: #211e38;
      --bg-story: #0a0918;
      --text-primary: #eeeaf8;
      --text-secondary: #9b97b5;
      --text-muted: #5a5675;
      --border: rgba(200,195,255,0.1);
      --border-strong: rgba(200,195,255,0.2);
    }
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--surface-0);
    color: var(--text-primary);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
