import { useRef, useState } from 'react'
import { aDataURL, ErrorFoto, procesarFoto } from '../lib/procesar'
import { clasificar } from '../lib/modelo'
import { pct, promedio, veredicto } from '../lib/veredicto'
import { Escala } from './Escala'
import { Alerta, Camara, Check, Cruz, Flecha, Galeria, Info, Objetivo, Sol, Capas, Escanear } from './Iconos'
import type { EstadoModelo } from '../App'

const NOMBRES_VISTA = ['Corona', 'Cicatriz', 'Lateral']
const MAX_VISTAS = 3

interface Vista {
  entrada: string
  original: string
  p: number
}

interface Props {
  numero: number
  estadoModelo: EstadoModelo
  reintentarModelo: () => void
  onGuardar: (p: number, vistas: number, miniatura: string) => void
  avisar: (t: string) => void
  irAGuia: () => void
}

function miniatura(src: string): Promise<string> {
  return new Promise((ok) => {
    const im = new Image()
    im.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 96
      c.getContext('2d')!.drawImage(im, 0, 0, 96, 96)
      ok(c.toDataURL('image/jpeg', 0.75))
    }
    im.onerror = () => ok(src)
    im.src = src
  })
}

export function Analizar({ numero, estadoModelo, reintentarModelo, onGuardar, avisar, irAGuia }: Props) {
  const [vistas, setVistas] = useState<Vista[]>([])
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const pm = promedio(vistas.map((v) => v.p))
  const v = veredicto(pm)
  const ultima = vistas[vistas.length - 1]
  const lleno = vistas.length >= MAX_VISTAS

  async function analizar(fuentes: Blob[]) {
    setError('')
    const libres = MAX_VISTAS - vistas.length
    if (libres <= 0) {
      setError('Ya tienes 3 vistas de este fruto. Guárdalo o descártalo para seguir.')
      return
    }
    if (fuentes.length > libres) setError(`Solo se usaron ${libres} foto(s): el máximo es 3 vistas por fruto.`)
    setProcesando(true)
    try {
      for (const f of fuentes.slice(0, libres)) {
        try {
          const r = await procesarFoto(f)
          const p = await clasificar(r.entrada)
          setVistas((vs) => [...vs, { entrada: aDataURL(r.entrada), original: r.original, p }])
        } catch (e) {
          if (e instanceof ErrorFoto) setError(e.message)
          else setError('No se pudo analizar la foto: ' + (e instanceof Error ? e.message : String(e)))
        }
      }
    } finally {
      setProcesando(false)
    }
  }

  function alElegir(ev: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(ev.target.files || [])
    ev.target.value = ''
    if (fs.length) analizar(fs)
  }

  async function probarEjemplo(nombre: 'sano' | 'deshidratado') {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}ejemplos/${nombre}.jpg`)
      analizar([await r.blob()])
    } catch {
      setError('No se pudo cargar la imagen de ejemplo.')
    }
  }

  async function guardar() {
    if (pm == null) return
    onGuardar(pm, vistas.length, await miniatura(vistas[0].entrada))
    avisar(`Fruto #${numero} guardado en el lote`)
    setVistas([])
    setError('')
  }

  const modeloListo = estadoModelo === 'listo'
  const deshabilitado = procesando || lleno || estadoModelo === 'error'

  return (
    <div className="rejilla-analizar">
      <div>
        <section className="hero">
          <h2>Evalúa un arándano</h2>
          <p>Toma hasta 3 fotos del mismo fruto (corona, cicatriz y lateral). El modelo detecta el arrugamiento por deshidratación y promedia las vistas.</p>
        </section>

        <section className="tarjeta" style={{ marginTop: 14 }}>
          <div className="tarjeta-cab">
            <div>
              <div className="eyebrow">Fruto</div>
              <h2 className="num">#{numero}</h2>
            </div>
            <span className="muted small num">{vistas.length} de {MAX_VISTAS} vistas</span>
          </div>

          <div className="vistas">
            {Array.from({ length: MAX_VISTAS }, (_, i) => {
              const vi = vistas[i]
              if (vi) {
                const ve = veredicto(vi.p)!
                return (
                  <div className="vista llena" key={i}>
                    <img src={vi.entrada} alt={`Vista ${i + 1} preprocesada`} />
                    <div className="etq"><span>V{i + 1}</span><span className={`chip ${ve.clase}`}>{pct(vi.p)}</span></div>
                  </div>
                )
              }
              if (i === vistas.length && procesando)
                return (
                  <div className="vista procesando" key={i}>
                    <span className="girando" />
                    <b>Analizando…</b>
                  </div>
                )
              return (
                <div className="vista" key={i}>
                  <span className="num">V{i + 1}</span>
                  <b>{NOMBRES_VISTA[i]}</b>
                  {i === 0 && <span>obligatoria</span>}
                  {i > 0 && <span>opcional</span>}
                </div>
              )
            })}
          </div>

          <div className="fila-btn" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => camara.current?.click()} disabled={deshabilitado}>
              {procesando ? <span className="girando" /> : <Camara />} Tomar foto
            </button>
            <button className="btn sec" onClick={() => galeria.current?.click()} disabled={deshabilitado}>
              <Galeria /> Galería
            </button>
          </div>
          <input ref={camara} className="sr" type="file" accept="image/*" capture="environment" onChange={alElegir} tabIndex={-1} />
          <input ref={galeria} className="sr" type="file" accept="image/*" multiple onChange={alElegir} tabIndex={-1} />

          {estadoModelo === 'cargando' && (
            <div className="aviso info"><span className="girando" style={{ width: 16, height: 16 }} /> Preparando el modelo de IA (solo la primera vez)…</div>
          )}
          {estadoModelo === 'error' && (
            <div className="aviso">
              <Alerta size={18} />
              <span>No se pudo iniciar el modelo. Revisa tu conexión y <button className="chip-btn" onClick={reintentarModelo}>reintentar</button></span>
            </div>
          )}
          {error && <div className="aviso" role="alert"><Alerta size={18} /><span>{error}</span></div>}

          {!vistas.length && !procesando && (
            <div className="ejemplos" style={{ marginTop: 14 }}>
              <span>¿Sin fruto a mano? Prueba con un ejemplo:</span>
              <button className="chip-btn" onClick={() => probarEjemplo('sano')} disabled={!modeloListo}>Sano</button>
              <button className="chip-btn" onClick={() => probarEjemplo('deshidratado')} disabled={!modeloListo}>Deshidratado</button>
            </div>
          )}
        </section>
      </div>

      <div className="col-lateral">
        <section className="tarjeta">
          <div className="tarjeta-cab"><h2>Resultado</h2>{vistas.length > 0 && <span className="muted small">promedio de {vistas.length} vista{vistas.length > 1 ? 's' : ''}</span>}</div>

          <div className={`resultado ${v ? v.clase : 'vacio'}`} aria-live="polite">
            <div className="resultado-cab">
              <div className="resultado-icono">
                {!v ? <Escanear size={22} /> : v.clase === 'ok' ? <Check size={22} /> : v.clase === 'mal' ? <Cruz size={22} /> : <Alerta size={22} />}
              </div>
              <div>
                <h3>{v ? v.titulo : 'Sin analizar'}</h3>
                <p className="small muted">{v ? v.detalle : 'Toma una foto para ver el veredicto.'}</p>
              </div>
              {pm != null && (
                <div className="prob">
                  <b className="num">{pct(pm)}</b>
                  <span>P(deshidratado)</span>
                </div>
              )}
            </div>
            <Escala p={pm} />
          </div>

          {ultima && (
            <div style={{ marginTop: 16 }}>
              <div className="small muted" style={{ marginBottom: 8 }}>Última foto: lo que entra al modelo</div>
              <div className="comparar">
                <figure><img src={ultima.original} alt="Foto original recortada" /><figcaption>Tu foto</figcaption></figure>
                <Flecha className="flecha" />
                <figure><img src={ultima.entrada} alt="Imagen preprocesada" /><figcaption>Normalizada · fondo gris</figcaption></figure>
              </div>
            </div>
          )}

          <div className="fila-btn" style={{ marginTop: 16 }}>
            <button className="btn" onClick={guardar} disabled={pm == null || procesando}><Check /> Guardar y siguiente</button>
            <button className="btn fantasma" onClick={() => { setVistas([]); setError('') }} disabled={!vistas.length || procesando}>Descartar</button>
          </div>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cab"><h2>Para una buena foto</h2></div>
          <ul className="consejos">
            <li><Capas size={18} /><span><b>Fondo gris claro y mate</b>, sin manchas ni otros objetos.</span></li>
            <li><Objetivo size={18} /><span><b>Un solo fruto centrado</b>, ocupando ~1/5 a 1/3 del ancho de la foto.</span></li>
            <li><Sol size={18} /><span><b>Luz difusa y pareja</b>: sin flash, sin sol directo ni sombras fuertes.</span></li>
            <li><Info size={18} /><span>Cámara quieta y paralela a la mesa. <button className="chip-btn" onClick={irAGuia}>Ver guía completa</button></span></li>
          </ul>
        </section>
      </div>
    </div>
  )
}
