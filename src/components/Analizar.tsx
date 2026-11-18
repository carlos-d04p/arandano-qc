import { useRef, useState } from 'react'
import { aDataURL, analizarFoto, ErrorFoto, type Caja, type FotoProcesada } from '../lib/procesar'
import { clasificar } from '../lib/modelo'
import { evaluarCalidad, FotoNoValida, type Aviso } from '../lib/calidad'
import { DEFECTOS, inspeccionar, type CodigoDefecto } from '../lib/defectos'
import type { Extra } from '../lib/lote'
import { pct, promedio, UMBRAL_ALTO, UMBRAL_BAJO, veredictoFinal } from '../lib/veredicto'
import { Escala } from './Escala'
import { Alerta, Camara, Galeria, Mas } from './Iconos'
import type { EstadoModelo } from '../App'

const MAX_VISTAS = 3

interface Vista {
  entrada: string
  original: string
  p: number
  avisos: Aviso[]
  defectos: CodigoDefecto[]
}

/** Un fruto dentro del modo «varios frutos» (una o más fotos; cada fruto con una sola vista) */
interface FrutoG {
  foto: number
  caja: Caja | null
  entrada?: string
  original?: string
  p?: number
  avisos: Aviso[]
  defectos: CodigoDefecto[]
  error?: string
}

interface Grupo {
  fotos: { vista: string; proporcion: number }[]
  frutos: FrutoG[]
  ignorados: number
}

interface Props {
  numero: number
  estadoModelo: EstadoModelo
  reintentarModelo: () => void
  onGuardar: (p: number, vistas: number, miniatura: string, extra: Extra) => void
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

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))
const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p)

async function evaluar(f: FotoProcesada, varios: boolean) {
  const avisos = evaluarCalidad(f.medidas, { varios })
  const p = await clasificar(f.entrada)
  return { p, avisos, defectos: inspeccionar(f.entrada) }
}

export function Analizar({ numero, estadoModelo, reintentarModelo, onGuardar, avisar, irAGuia }: Props) {
  const [vistas, setVistas] = useState<Vista[]>([])
  const [sel, setSel] = useState(0)
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [selG, setSelG] = useState(0)
  const [verOriginal, setVerOriginal] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const pm = promedio(vistas.map((v) => v.p))
  const defectos = [...new Set(vistas.flatMap((x) => x.defectos))]
  const v = veredictoFinal(pm, defectos)
  const actual = vistas[Math.min(sel, vistas.length - 1)]
  const lleno = vistas.length >= MAX_VISTAS
  const conAvisos = vistas.filter((x) => x.avisos.length).length
  const ps = vistas.map((x) => x.p)
  const vistasDiscrepan = ps.length > 1 && Math.max(...ps) >= UMBRAL_ALTO && Math.min(...ps) <= UMBRAL_BAJO

  async function analizar(fuentes: Blob[]) {
    if (!fuentes.length) return
    setError('')
    setProcesando(true)
    const errores: string[] = []
    // Varias fotos a la vez = varios frutos distintos (nunca se promedian como vistas del mismo fruto)
    let modoGrupo = grupo != null || (fuentes.length > 1 && vistas.length === 0)
    let nVistas = vistas.length
    let nFotos = grupo?.fotos.length ?? 0
    try {
      for (const [k, f] of fuentes.entries()) {
        const etq = fuentes.length > 1 ? `Foto ${k + 1}: ` : 'La foto '
        try {
          const r = await analizarFoto(f)
          if (!r.varios && !modoGrupo) {
            // un solo fruto: vista del fruto en curso
            if (nVistas >= MAX_VISTAS) break
            const ev = await evaluar(r.foto, false)
            setVistas((vs) => [...vs, { entrada: aDataURL(r.foto.entrada), original: r.foto.original, ...ev }])
            setSel(MAX_VISTAS) // se ajusta a la última vista disponible
            nVistas++
            continue
          }
          if (r.varios && nVistas > 0) {
            errores.push(`${etq}tiene ${r.frutos.length} frutos. Guarda o descarta el fruto actual antes de analizar una foto con varios frutos.`)
            continue
          }
          modoGrupo = true
          const nuevos: FrutoG[] = []
          const foto = r.varios ? { vista: r.vista, proporcion: r.proporcion } : { vista: r.foto.original, proporcion: 1 }
          const items = r.varios ? r.frutos : [{ ...r.foto, caja: null }]
          for (const it of items) {
            if ('error' in it) {
              nuevos.push({ foto: nFotos, caja: it.caja, avisos: [], defectos: [], error: it.error })
              continue
            }
            try {
              const ev = await evaluar(it, r.varios)
              nuevos.push({ foto: nFotos, caja: it.caja, entrada: aDataURL(it.entrada), original: it.original, ...ev })
            } catch (e) {
              nuevos.push({ foto: nFotos, caja: it.caja, avisos: [], defectos: [], error: mensaje(e) })
            }
          }
          const ignorados = r.varios ? r.menores : 0
          setGrupo((g) => {
            const base = g ?? { fotos: [], frutos: [], ignorados: 0 }
            return { fotos: [...base.fotos, foto], frutos: [...base.frutos, ...nuevos], ignorados: base.ignorados + ignorados }
          })
          if (nFotos === 0) setSelG(0)
          nFotos++
        } catch (e) {
          if (e instanceof ErrorFoto || e instanceof FotoNoValida) errores.push(`${etq}no se analizó. ${e.message}`)
          else errores.push(`${etq}no se pudo analizar: ${mensaje(e)}`)
        }
      }
    } finally {
      setProcesando(false)
      if (errores.length) setError(errores.join(' '))
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
    setGrupo(null)
    setSelG(0)
    setError('')
  }

  async function guardar() {
    if (pm == null) return
    const avisos = [...new Set(vistas.flatMap((x) => x.avisos.map((a) => a.codigo)))]
    onGuardar(pm, vistas.length, await miniatura(vistas[0].entrada), { defectos, avisos })
    avisar(`Muestra ${numero} guardada en el lote`)
    reiniciar()
  }

  async function guardarGrupo() {
    if (!grupo) return
    const validos = grupo.frutos.filter((f) => f.p != null)
    for (const f of validos)
      onGuardar(f.p!, 1, await miniatura(f.entrada!), { defectos: f.defectos, avisos: f.avisos.map((a) => a.codigo) })
    avisar(`${validos.length} ${plural(validos.length, 'fruto guardado', 'frutos guardados')} en el lote`)
    reiniciar()
  }

  const bloqueado = procesando || estadoModelo === 'error'

  const entradas = (
    <>
      <input ref={camara} className="sr" type="file" accept="image/*" capture="environment" onChange={alElegir} tabIndex={-1} />
      <input ref={galeria} className="sr" type="file" accept="image/*" multiple onChange={alElegir} tabIndex={-1} />
      {error && <div className="nota error" role="alert" style={{ marginTop: 12 }}><Alerta size={16} /><span>{error}</span></div>}
      {estadoModelo === 'error' && (
        <div className="nota error" style={{ marginTop: 12 }}>
          <Alerta size={16} />
          <span>No se pudo iniciar el modelo. Revisa la conexión y <button className="enlace" onClick={reintentarModelo}>vuelve a intentarlo</button>.</span>
        </div>
      )}
    </>
  )

  const recomendaciones = (
    <div className="panel">
      <div className="panel-cab"><h2>Recomendaciones para la foto</h2></div>
      <div className="panel-cuerpo">
        <ul className="recomendaciones">
          <li>Cartulina gris claro mate, limpia y sin otros objetos.</li>
          <li>Un fruto centrado, ocupando entre 1/5 y 1/3 del ancho de la imagen.</li>
          <li>Para varios frutos a la vez: separados entre sí y sin que ninguno quede cortado por el borde.</li>
          <li>Luz difusa: sin flash, sin sol directo y sin sombras marcadas.</li>
          <li>Celular estable y paralelo a la mesa; espera a que enfoque.</li>
        </ul>
        <p className="small" style={{ marginTop: 10 }}><button className="enlace" onClick={irAGuia}>Ver cómo funciona el análisis</button></p>
      </div>
    </div>
  )

  const cabecera = (
    <div className="cab-pagina">
      <div>
        <h1>Evaluar muestra</h1>
        <p>Fotografía uno o varios arándanos sobre fondo gris claro. Si la foto tiene varios frutos, cada uno se evalúa por separado.</p>
      </div>
    </div>
  )

  if (grupo) return vistaGrupo(grupo)

  return (
    <>
      {cabecera}
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
                    <p>Un fruto centrado, o varios separados entre sí, con luz pareja y sin flash.</p>
                  </div>
                  <div className="fila-btn">
                    <button className="btn" onClick={() => camara.current?.click()} disabled={bloqueado}><Camara size={18} /> Tomar foto</button>
                    <button className="btn sec" onClick={() => galeria.current?.click()} disabled={bloqueado}><Galeria size={18} /> Subir imágenes</button>
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
                    <button className="miniatura agregar" onClick={() => camara.current?.click()} disabled={bloqueado} aria-label="Agregar otra vista del mismo fruto" title="Otra vista del mismo fruto">
                      <Mas size={18} />
                      Vista
                    </button>
                  )}
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  {verOriginal ? 'Recorte de tu foto original.' : 'Imagen normalizada con fondo gris: es exactamente lo que analiza el modelo.'}
                  {' '}«+ Vista» agrega otra foto <b>del mismo fruto</b>; para otro fruto, guarda o descarta este primero.
                </p>
              </>
            )}

            {entradas}

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
              {pm != null && <p className="small muted nota-escala">La probabilidad expresa qué tan seguro está el modelo de que el fruto esté deshidratado; no mide el grado de deshidratación.</p>}

              <dl className="datos">
                <dt>Probabilidad de deshidratación</dt>
                <dd className="mono">{pm != null ? pct(pm) : '—'}</dd>
                <dt>Vistas analizadas</dt>
                <dd className="mono">{vistas.length || '—'}</dd>
                <dt>Otros defectos <span className="etq-exp">exp.</span></dt>
                <dd>{!vistas.length ? '—' : defectos.length ? <span className="calidad duda">Revisar</span> : <span className="calidad ok">No detectados</span>}</dd>
                <dt>Calidad de la foto</dt>
                <dd>{!vistas.length ? '—' : conAvisos ? <span className="calidad duda">{conAvisos === vistas.length ? 'Con advertencias' : `${conAvisos} de ${vistas.length} con advertencias`}</span> : <span className="calidad ok">Adecuada</span>}</dd>
                <dt>Criterio</dt>
                <dd className="small">&lt; {Math.round(UMBRAL_BAJO * 100)} % cumple · ≥ {Math.round(UMBRAL_ALTO * 100)} % no cumple</dd>
              </dl>

              {vistasDiscrepan && (
                <div className="nota error" style={{ marginTop: 14 }}>
                  <Alerta size={16} />
                  <span>
                    <b>Las vistas no coinciden</b> ({ps.map(pct).join(', ')}). Comprueba que todas sean del mismo fruto; si no, descarta y evalúa cada fruto por separado.
                  </span>
                </div>
              )}

              {defectos.length > 0 && (
                <div className="nota aviso" style={{ marginTop: 14 }}>
                  <Alerta size={16} />
                  <div>
                    <b>Otros defectos (experimental).</b> El modelo solo evalúa la deshidratación; esta revisión usa la forma y el color del fruto.
                    Confírmalo a simple vista:
                    <ul className="lista-avisos">{defectos.map((d) => <li key={d}><b>{DEFECTOS[d].titulo}.</b> {DEFECTOS[d].texto}</li>)}</ul>
                  </div>
                </div>
              )}

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

              {pm != null && pm > UMBRAL_BAJO && pm < UMBRAL_ALTO && !lleno && (
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
          {recomendaciones}
        </div>
      </div>
    </>
  )

  // ---------- Modo varios frutos ----------
  function vistaGrupo(g: Grupo) {
    const iSel = Math.min(selG, g.frutos.length - 1)
    const fr = g.frutos[iSel]
    const foto = g.fotos[fr.foto]
    const vs = g.frutos.map((f) => (f.p != null ? veredictoFinal(f.p, f.defectos) : null))
    const cuenta = (c: string) => vs.filter((x) => x?.clase === c).length
    const fallidos = g.frutos.filter((f) => f.p == null).length
    const validos = g.frutos.length - fallidos
    const vSel = vs[iSel]
    const conAv = g.frutos.filter((f) => f.avisos.length).length

    return (
      <>
        {cabecera}
        <div className="rejilla-evaluar">
          <div className="panel">
            <div className="panel-cab">
              <h2>Imagen</h2>
              <span className="meta">{g.fotos.length > 1 ? `Foto ${fr.foto + 1} de ${g.fotos.length}` : `${g.frutos.length} ${plural(g.frutos.length, 'fruto')} en la foto`}</span>
            </div>
            <div className="panel-cuerpo">
              <div className="vista-grupo" style={{ aspectRatio: String(foto.proporcion) }}>
                <img src={foto.vista} alt={`Foto ${fr.foto + 1} con los frutos numerados`} />
                {g.frutos.map((f, i) =>
                  f.foto === fr.foto && f.caja ? (
                    <button
                      key={i}
                      className={`caja-fruto ${vs[i]?.clase ?? 'fallo'}`}
                      aria-pressed={i === iSel}
                      aria-label={`Fruto ${i + 1}`}
                      onClick={() => setSelG(i)}
                      style={{ left: `${f.caja.x * 100}%`, top: `${f.caja.y * 100}%`, width: `${f.caja.w * 100}%`, height: `${f.caja.h * 100}%` }}
                    >
                      <span>{i + 1}</span>
                    </button>
                  ) : null,
                )}
                {procesando && <div className="cargando"><span className="girando" /> Analizando…</div>}
              </div>

              <div className="detalle-fruto">
                {fr.entrada ? <img src={fr.entrada} alt={`Fruto ${iSel + 1} procesado`} /> : <span className="sin-img" />}
                <div>
                  <b>Fruto {iSel + 1}</b>
                  {vSel ? (
                    <p><span className={`calidad ${vSel.clase}`}>{vSel.corto}</span> <span className="mono muted">· {pct(fr.p!)}</span></p>
                  ) : (
                    <p className="small texto-mal">No analizado. {fr.error}</p>
                  )}
                  {fr.defectos.length > 0 && <p className="small">Otros defectos: {fr.defectos.map((d) => DEFECTOS[d].titulo.toLowerCase()).join(', ')}.</p>}
                  {fr.avisos.length > 0 && <p className="small texto-aviso">{fr.avisos.map((a) => a.texto).join(' ')}</p>}
                </div>
              </div>

              {entradas}
            </div>
          </div>

          <div>
            <div className="panel">
              <div className="panel-cab">
                <h2>Resultado</h2>
                <span className="meta">{validos} {plural(validos, 'fruto evaluado', 'frutos evaluados')}</span>
              </div>
              <div className="cifras">
                <div className="cifra ok"><span>Cumplen</span><b>{cuenta('ok')}</b></div>
                <div className="cifra duda"><span>Dudosos o a revisar</span><b>{cuenta('duda')}</b></div>
                <div className="cifra mal"><span>No cumplen</span><b>{cuenta('mal')}</b></div>
                <div className="cifra"><span>No analizados</span><b>{fallidos}</b></div>
              </div>
              <div className="lista-grupo">
                {g.frutos.map((f, i) => (
                  <button key={i} className="fila-grupo" aria-pressed={i === iSel} onClick={() => setSelG(i)}>
                    <span className="mono n">{i + 1}</span>
                    {f.entrada ? <img src={f.entrada} alt="" /> : <span className="sin-img" />}
                    <span className="mono p">{f.p != null ? pct(f.p) : '—'}</span>
                    <span className="res">
                      {vs[i] ? <span className={`calidad ${vs[i]!.clase}`}>{vs[i]!.corto}</span> : <span className="small muted">No analizado</span>}
                      {f.defectos.length > 0 && <span className="defecto-mini">otros defectos</span>}
                      {f.avisos.length > 0 && <span className="aviso-mini">foto</span>}
                    </span>
                  </button>
                ))}
              </div>
              <div className="panel-cuerpo">
                {(fallidos > 0 || g.ignorados > 0) && (
                  <div className="nota info" style={{ marginBottom: 12 }}>
                    <Alerta size={16} />
                    <span>
                      {fallidos > 0 && `${fallidos} ${plural(fallidos, 'fruto no se analizó', 'frutos no se analizaron')} (cortado por el borde o pegado a otro). `}
                      {g.ignorados > 0 && `Se ignoraron ${g.ignorados} ${plural(g.ignorados, 'objeto oscuro demasiado pequeño', 'objetos oscuros demasiado pequeños')}. `}
                      Para incluirlos, sepáralos y toma otra foto.
                    </span>
                  </div>
                )}
                {conAv > 0 && (
                  <div className="nota aviso" style={{ marginBottom: 12 }}>
                    <Alerta size={16} />
                    <span>{conAv} {plural(conAv, 'fruto tiene', 'frutos tienen')} advertencias de calidad de la foto: su resultado es menos confiable.</span>
                  </div>
                )}
                <p className="small muted">
                  En este modo cada fruto se evalúa con una sola vista. Para confirmar un resultado dudoso, fotografía ese fruto solo y agrega más vistas.
                </p>
                <div className="fila-btn llenar" style={{ marginTop: 14 }}>
                  <button className="btn" onClick={guardarGrupo} disabled={!validos || procesando}>Guardar {validos} en el lote</button>
                  <button className="btn sec" onClick={() => camara.current?.click()} disabled={bloqueado}><Camara size={16} /> Otra foto</button>
                </div>
                <div className="fila-btn" style={{ marginTop: 8 }}>
                  <button className="btn texto" onClick={reiniciar} disabled={procesando}>Descartar todo</button>
                  <button className="btn texto" onClick={() => galeria.current?.click()} disabled={bloqueado}><Galeria size={16} /> Subir más fotos</button>
                </div>
              </div>
            </div>
            {recomendaciones}
          </div>
        </div>
      </>
    )
  }
}
