import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'

window.addEventListener('error', (event) => {
  document.body.innerHTML += `<div style="color:red; z-index:9999; position:absolute; top:0; background:white; padding:20px;">
        <h2>Global Error Caught:</h2>
        <pre>${event.error?.stack || event.message}</pre>
    </div>`;
});

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{ color: 'red', padding: '20px', background: 'white' }}><h1>React Crash</h1><pre>{String(this.state.error)}</pre></div>;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
