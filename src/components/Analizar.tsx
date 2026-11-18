import { useRef, useState } from 'react'
import { aDataURL, ErrorFoto, procesarFoto } from '../lib/procesar'
import { clasificar } from '../lib/modelo'
import { evaluarCalidad, FotoNoValida, type Aviso } from '../lib/calidad'
import { pct, promedio, UMBRAL_ALTO, UMBRAL_BAJO, veredicto } from '../lib/veredicto'
import { Escala } from './Escala'
import { Alerta, Camara, Galeria, Mas } from './Iconos'
import type { EstadoModelo } from '../App'

const MAX_VISTAS = 3

interface Vista {
  entrada: string
  original: string
  p: number
  avisos: Aviso[]
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
  const [sel, setSel] = useState(0)
  const [verOriginal, setVerOriginal] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const pm = promedio(vistas.map((v) => v.p))
  const v = veredicto(pm)
  const actual = vistas[Math.min(sel, vistas.length - 1)]
  const lleno = vistas.length >= MAX_VISTAS
  const conAvisos = vistas.filter((x) => x.avisos.length).length

  async function analizar(fuentes: Blob[]) {
    setError('')
    const libres = MAX_VISTAS - vistas.length
    if (libres <= 0) return
    setProcesando(true)
    try {
      for (const f of fuentes.slice(0, libres)) {
        try {
          const r = await procesarFoto(f)
          const avisos = evaluarCalidad(r.medidas)
          const p = await clasificar(r.entrada)
          setVistas((vs) => [...vs, { entrada: aDataURL(r.entrada), original: r.original, p, avisos }])
          setSel(MAX_VISTAS) // se ajusta a la última vista disponible
        } catch (e) {
          if (e instanceof ErrorFoto || e instanceof FotoNoValida) setError(`No se analizó la foto. ${e.message}`)
          else setError('No se pudo analizar la imagen: ' + (e instanceof Error ? e.message : String(e)))
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

  function repetir() {
    const i = Math.min(sel, vistas.length - 1)
    setVistas((vs) => vs.filter((_, k) => k !== i))
    setSel(MAX_VISTAS)
    setError('')
    camara.current?.click()
  }

  function reiniciar() {
    setVistas([])
    setSel(0)
    setError('')
  }

  async function guardar() {
    if (pm == null) return
    onGuardar(pm, vistas.length, await miniatura(vistas[0].entrada))
    avisar(`Muestra ${numero} guardada en el lote`)
    reiniciar()
  }

  const bloqueado = procesando || estadoModelo === 'error'

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Evaluar muestra</h1>
          <p>Fotografía un arándano sobre fondo gris claro. Una foto desde cualquier ángulo es suficiente.</p>
        </div>
      </div>

      <div className="rejilla-evaluar">
        <div className="panel">
          <div className="panel-cab">
            <h2>Imagen</h2>
            {actual && (
              <div className="segmento" role="group" aria-label="Imagen mostrada">
                <button aria-pressed={!verOriginal} onClick={() => setVerOriginal(false)}>Procesada</button>
                <button aria-pressed={verOriginal} onClick={() => setVerOriginal(true)}>Original</button>
              </div>
            )}
          </div>
          <div className="panel-cuerpo">
            {!actual ? (
              procesando ? (
                <div className="captura procesando"><span className="girando" /> Analizando la imagen…</div>
              ) : (
                <div className="captura">
                  <div>
                    <h3>Sin imagen</h3>
                    <p>Un solo fruto, centrado, con luz pareja y sin flash.</p>
                  </div>
                  <div className="fila-btn">
                    <button className="btn" onClick={() => camara.current?.click()} disabled={bloqueado}><Camara size={18} /> Tomar foto</button>
                    <button className="btn sec" onClick={() => galeria.current?.click()} disabled={bloqueado}><Galeria size={18} /> Subir imagen</button>
                  </div>
                </div>
              )
            ) : (
              <>
                <div className="visor">
                  <img src={verOriginal ? actual.original : actual.entrada} alt={verOriginal ? 'Foto original' : 'Imagen preprocesada que recibe el modelo'} />
                  {procesando && <div className="cargando"><span className="girando" /> Analizando…</div>}
                </div>
                <div className="tira">
                  {vistas.map((vi, i) => (
                    <button key={i} className="miniatura" aria-pressed={i === sel} onClick={() => setSel(i)} aria-label={`Vista ${i + 1}`}>
                      <img src={vi.entrada} alt="" />
                      {vi.avisos.length > 0 && <span className="marca-aviso" title="Foto con advertencias de calidad">!</span>}
                      <span className="p">{pct(vi.p)}</span>
                    </button>
                  ))}
                  {!lleno && (
                    <button className="miniatura agregar" onClick={() => camara.current?.click()} disabled={bloqueado} aria-label="Agregar otra vista">
                      <Mas size={18} />
                      Vista
                    </button>
                  )}
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  {verOriginal ? 'Recorte de tu foto original.' : 'Imagen normalizada con fondo gris: es exactamente lo que analiza el modelo.'}
                </p>
              </>
            )}

            <input ref={camara} className="sr" type="file" accept="image/*" capture="environment" onChange={alElegir} tabIndex={-1} />
            <input ref={galeria} className="sr" type="file" accept="image/*" multiple onChange={alElegir} tabIndex={-1} />

            {error && <div className="nota error" role="alert" style={{ marginTop: 12 }}><Alerta size={16} /><span>{error}</span></div>}
            {estadoModelo === 'error' && (
              <div className="nota error" style={{ marginTop: 12 }}>
                <Alerta size={16} />
                <span>No se pudo iniciar el modelo. Revisa la conexión y <button className="enlace" onClick={reintentarModelo}>vuelve a intentarlo</button>.</span>
              </div>
            )}

            {!vistas.length && !procesando && (
              <p className="ejemplos">
                ¿No tienes un fruto a mano? Prueba con una imagen de ejemplo:{' '}
                <button className="enlace" onClick={() => probarEjemplo('sano')} disabled={bloqueado}>sano</button>
                {' · '}
                <button className="enlace" onClick={() => probarEjemplo('deshidratado')} disabled={bloqueado}>deshidratado</button>
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-cab">
              <h2>Resultado</h2>
              <span className="meta mono">Muestra {String(numero).padStart(3, '0')}</span>
            </div>
            <div className="panel-cuerpo">
              <div className={`veredicto ${v ? v.clase : 'vacio'}`} aria-live="polite">
                <div className="etq">Veredicto</div>
                <h3>{v ? v.titulo : 'Pendiente'}</h3>
                <p>{v ? v.detalle : estadoModelo === 'cargando' ? 'Preparando el modelo…' : 'Toma o sube una foto para evaluar el fruto.'}</p>
              </div>

              <Escala p={pm} />

              <dl className="datos">
                <dt>Probabilidad de deshidratación</dt>
                <dd className="mono">{pm != null ? pct(pm) : '—'}</dd>
                <dt>Vistas analizadas</dt>
                <dd className="mono">{vistas.length || '—'}</dd>
                <dt>Calidad de la foto</dt>
                <dd>{!vistas.length ? '—' : conAvisos ? <span className="calidad duda">{conAvisos === vistas.length ? 'Con advertencias' : `${conAvisos} de ${vistas.length} con advertencias`}</span> : <span className="calidad ok">Adecuada</span>}</dd>
                <dt>Criterio</dt>
                <dd className="small">&lt; {Math.round(UMBRAL_BAJO * 100)} % cumple · ≥ {Math.round(UMBRAL_ALTO * 100)} % no cumple</dd>
              </dl>

              {actual && actual.avisos.length > 0 && (
                <div className="nota aviso" style={{ marginTop: 14 }}>
                  <Alerta size={16} />
                  <div>
                    <b>Resultado poco confiable{vistas.length > 1 ? ` en la vista ${Math.min(sel, vistas.length - 1) + 1}` : ''}.</b> La foto no cumple las condiciones con que se entrenó el modelo:
                    <ul className="lista-avisos">{actual.avisos.map((a) => <li key={a.codigo}>{a.texto}</li>)}</ul>
                    <div className="nota-acc"><button className="btn sec peq" onClick={repetir} disabled={bloqueado}><Camara size={16} /> Repetir foto</button></div>
                  </div>
                </div>
              )}

              {v?.clase === 'duda' && !lleno && (
                <div className="nota aviso" style={{ marginTop: 14 }}>
                  <Alerta size={16} />
                  <div>
                    Resultado no concluyente. Toma otra foto del mismo fruto desde otro ángulo (por ejemplo, la cicatriz del pedúnculo) para confirmarlo.
                    <div className="nota-acc"><button className="btn sec peq" onClick={() => camara.current?.click()} disabled={bloqueado}><Camara size={16} /> Agregar vista</button></div>
                  </div>
                </div>
              )}

              <div className="fila-btn llenar" style={{ marginTop: 18 }}>
                <button className="btn" onClick={guardar} disabled={pm == null || procesando}>Guardar en el lote</button>
                <button className="btn sec" onClick={reiniciar} disabled={!vistas.length || procesando}>Descartar</button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-cab"><h2>Recomendaciones para la foto</h2></div>
            <div className="panel-cuerpo">
              <ul className="recomendaciones">
                <li>Cartulina gris claro mate, limpia y sin otros objetos.</li>
                <li>El fruto centrado, ocupando entre 1/5 y 1/3 del ancho de la imagen.</li>
                <li>Luz difusa: sin flash, sin sol directo y sin sombras marcadas.</li>
                <li>Celular estable y paralelo a la mesa; espera a que enfoque.</li>
              </ul>
              <p className="small" style={{ marginTop: 10 }}><button className="enlace" onClick={irAGuia}>Ver cómo funciona el análisis</button></p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
