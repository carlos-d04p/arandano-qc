import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// La app instalada puede quedar abierta días sin recargarse: se busca una versión nueva al volver a ella
// y cada 30 minutos. Al encontrarla, el service worker se actualiza y la página se recarga sola.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const revisar = () => {
      if (navigator.onLine) registro.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revisar()
    })
    setInterval(revisar, 30 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
