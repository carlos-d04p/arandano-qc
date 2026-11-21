import { useCallback, useEffect, useRef, useState } from 'react'
import { Analizar } from './components/Analizar'
import { ComoFunciona } from './components/ComoFunciona'
import { Lote } from './components/Lote'
import { Validacion } from './components/Validacion'
import { Escanear, Info, Lista, Logo, Matriz } from './components/Iconos'
import { cargarModelo } from './lib/modelo'
import { useDatosLote, useLote } from './lib/lote'

export type EstadoModelo = 'cargando' | 'listo' | 'error'
export interface AccionAviso {
  etiqueta: string
  fn: () => void
}
type Pestana = 'analizar' | 'lote' | 'validacion' | 'guia'

const PESTANAS: { id: Pestana; titulo: string; Icono: typeof Escanear }[] = [
  { id: 'analizar', titulo: 'Evaluar', Icono: Escanear },
  { id: 'lote', titulo: 'Lote', Icono: Lista },
  { id: 'validacion', titulo: 'Validación', Icono: Matriz },
  { id: 'guia', titulo: 'Cómo funciona', Icono: Info },
]

function pestanaInicial(): Pestana {
  const h = location.hash.slice(1)
  return h === 'lote' || h === 'validacion' || h === 'guia' ? h : 'analizar'
}

export default function App() {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial)
  const [estadoModelo, setEstadoModelo] = useState<EstadoModelo>('cargando')
  const [toast, setToast] = useState<{ texto: string; accion?: AccionAviso } | null>(null)
  const timer = useRef<number>(undefined)
  const { lote, siguiente, agregar, quitar, restaurar, vaciar } = useLote()
  const { datos, cambiar, nuevoLote } = useDatosLote()

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
    const f = () => {
      const p = location.hash.slice(1)
      if (p === 'lote' || p === 'validacion' || p === 'guia' || p === '') setPestana(pestanaInicial())
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const href = (p: Pestana) => (p === 'analizar' ? '#' : `#${p}`)
  const ir = (p: Pestana, e?: React.MouseEvent) => {
    // los clics con Ctrl/Cmd o la rueda abren la sección en otra pestaña del navegador
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0)) return
    e?.preventDefault()
    if (p !== pestana) {
      history.replaceState(null, '', p === 'analizar' ? location.pathname : `#${p}`)
      setPestana(p)
      window.scrollTo({ top: 0 })
    }
  }

  const avisar = useCallback((texto: string, accion?: AccionAviso) => {
    setToast({ texto, accion })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), accion ? 6000 : 2600)
  }, [])

  const etiquetaModelo = { cargando: 'Cargando modelo…', listo: 'Modelo listo', error: 'Error de modelo · reintentar' }[estadoModelo]

  return (
    <div className="app">
      <a
        className="saltar"
        href="#contenido"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('contenido')?.focus()
        }}
      >
        Saltar al contenido
      </a>
      <header className="topbar">
        <div className="topbar-in">
          <a className="marca" href="#" onClick={(e) => ir('analizar', e)} aria-label="BerryScan, ir a Evaluar">
            <Logo />
            <span className="marca-nombre" translate="no">BerryScan</span>
          </a>
          <nav className="tabs-top" aria-label="Secciones">
            {PESTANAS.map(({ id, titulo }) => (
              <a key={id} href={href(id)} onClick={(e) => ir(id, e)} aria-current={pestana === id ? 'page' : undefined}>
                {titulo}
                {id === 'lote' && lote.length > 0 && <span className="contador" aria-label={`${lote.length} muestras`}>{lote.length}</span>}
              </a>
            ))}
          </nav>
          <div className="espacio" />
          <button
            className={`estado-modelo ${estadoModelo}`}
            onClick={estadoModelo === 'error' ? iniciarModelo : undefined}
            disabled={estadoModelo !== 'error'}
            title="YOLOv11n-cls · ONNX Runtime Web"
            aria-live="polite"
          >
            <span className="punto" />
            {etiquetaModelo}
          </button>
        </div>
      </header>

      <main className="contenido" id="contenido" tabIndex={-1}>
        {/* Evaluar queda montado para no perder las vistas al cambiar de sección */}
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
        {pestana === 'lote' && (
          <Lote
            lote={lote}
            datos={datos}
            cambiar={cambiar}
            quitar={quitar}
            restaurar={restaurar}
            nuevoLote={() => {
              vaciar()
              nuevoLote()
            }}
            avisar={avisar}
            irAAnalizar={() => ir('analizar')}
          />
        )}
        {/* Validación también queda montada para no perder el registro en curso */}
        <div hidden={pestana !== 'validacion'}>
          <Validacion estadoModelo={estadoModelo} avisar={avisar} />
        </div>
        {pestana === 'guia' && <ComoFunciona estadoModelo={estadoModelo} />}
      </main>

      <nav className="nav-bottom" aria-label="Secciones">
        {PESTANAS.map(({ id, titulo, Icono }) => (
          <a key={id} href={href(id)} onClick={(e) => ir(id, e)} aria-current={pestana === id ? 'page' : undefined}>
            <span className="icono-wrap">
              <Icono size={21} />
              {id === 'lote' && lote.length > 0 && <span className="contador-badge" aria-label={`${lote.length} muestras`}>{lote.length}</span>}
            </span>
            {titulo}
          </a>
        ))}
      </nav>
      <div className="toast-zona" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <span>{toast.texto}</span>
            {toast.accion && (
              <button
                onClick={() => {
                  toast.accion!.fn()
                  setToast(null)
                }}
              >
                {toast.accion.etiqueta}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
