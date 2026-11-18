import { useCallback, useEffect, useRef, useState } from 'react'
import { Analizar } from './components/Analizar'
import { ComoFunciona } from './components/ComoFunciona'
import { Lote } from './components/Lote'
import { Escanear, Info, Lista, Logo } from './components/Iconos'
import { cargarModelo } from './lib/modelo'
import { useLote } from './lib/lote'

export type EstadoModelo = 'cargando' | 'listo' | 'error'
type Pestana = 'analizar' | 'lote' | 'guia'

const PESTANAS: { id: Pestana; titulo: string; Icono: typeof Escanear }[] = [
  { id: 'analizar', titulo: 'Analizar', Icono: Escanear },
  { id: 'lote', titulo: 'Lote', Icono: Lista },
  { id: 'guia', titulo: 'Cómo funciona', Icono: Info },
]

function pestanaInicial(): Pestana {
  const h = location.hash.slice(1)
  return h === 'lote' || h === 'guia' ? h : 'analizar'
}

export default function App() {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial)
  const [estadoModelo, setEstadoModelo] = useState<EstadoModelo>('cargando')
  const [toast, setToast] = useState('')
  const timer = useRef<number>(undefined)
  const { lote, siguiente, agregar, quitar, vaciar } = useLote()

  const esperarModelo = useCallback(() => {
    cargarModelo().then(
      () => setEstadoModelo('listo'),
      (e) => {
        console.error(e)
        setEstadoModelo('error')
      },
    )
  }, [])

  const iniciarModelo = useCallback(() => {
    setEstadoModelo('cargando')
    esperarModelo()
  }, [esperarModelo])

  useEffect(esperarModelo, [esperarModelo])

  useEffect(() => {
    const f = () => setPestana(pestanaInicial())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const ir = (p: Pestana) => {
    if (p !== pestana) {
      history.replaceState(null, '', p === 'analizar' ? location.pathname : `#${p}`)
      setPestana(p)
      window.scrollTo({ top: 0 })
    }
  }

  const avisar = useCallback((t: string) => {
    setToast(t)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(''), 2400)
  }, [])

  const etiquetaModelo = { cargando: 'Cargando modelo', listo: 'Modelo listo', error: 'Modelo sin cargar' }[estadoModelo]

  const botones = (clase: string) => (
    <nav className={clase} aria-label="Secciones">
      {PESTANAS.map(({ id, titulo, Icono }) => (
        <button key={id} onClick={() => ir(id)} aria-current={pestana === id ? 'page' : undefined}>
          <Icono size={clase === 'nav-bottom' ? 22 : 17} />
          {titulo}
          {id === 'lote' && lote.length > 0 && <span className="insignia num">{lote.length}</span>}
        </button>
      ))}
    </nav>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <div className="marca">
            <Logo />
            <div style={{ minWidth: 0 }}>
              <h1>Arándano QC</h1>
              <p>Control de calidad por visión artificial</p>
            </div>
          </div>
          <div className="espacio" />
          {botones('tabs-top')}
          <button
            className={`estado ${estadoModelo}`}
            onClick={estadoModelo === 'error' ? iniciarModelo : undefined}
            title={estadoModelo === 'error' ? 'Reintentar' : 'YOLOv11n-cls · ONNX'}
          >
            <span className="punto" />
            {etiquetaModelo}
          </button>
        </div>
      </header>

      <main className="contenido">
        {/* Analizar queda montado para no perder las vistas al cambiar de pestaña */}
        <div hidden={pestana !== 'analizar'}>
          <Analizar
            numero={siguiente}
            estadoModelo={estadoModelo}
            reintentarModelo={iniciarModelo}
            onGuardar={agregar}
            avisar={avisar}
            irAGuia={() => ir('guia')}
          />
        </div>
        {pestana === 'lote' && <Lote lote={lote} quitar={quitar} vaciar={vaciar} avisar={avisar} irAAnalizar={() => ir('analizar')} />}
        {pestana === 'guia' && <ComoFunciona estadoModelo={estadoModelo} />}
      </main>

      {botones('nav-bottom')}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
