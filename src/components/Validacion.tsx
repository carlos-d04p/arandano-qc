import { useRef, useState } from 'react'
import { aDataURL, analizarFoto, ErrorFoto, miniaturaDe } from '../lib/procesar'
import { clasificar } from '../lib/modelo'
import { evaluarCalidad, FotoNoValida, type CodigoAviso } from '../lib/calidad'
import { descargar } from '../lib/lote'
import { pct, UMBRAL_ALTO, UMBRAL_BAJO } from '../lib/veredicto'
import {
  aCSV, calcular, fmt, idFruto, porFruto, resumenTexto, useValidacion,
  type Caso, type ClaseReal, type Metricas, type Registro,
} from '../lib/validacion'
import { Alerta, Basura, Camara, Copiar, Descargar, Galeria } from './Iconos'
import type { EstadoModelo } from '../App'

const MAX_VISTAS = 3
const NOMBRE: Record<ClaseReal, string> = { sano: 'Sano', deshidratado: 'Deshidratado' }
const ETIQUETA_AVISO: Record<CodigoAviso, string> = {
  desenfoque: 'desenfocada o movida', pequeno: 'fruto pequeño', oscura: 'oscura', sobreexpuesta: 'sobreexpuesta',
  fondo: 'fondo con manchas', color: 'color poco habitual', objeto_cercano: 'objeto cercano',
}

interface Props {
  estadoModelo: EstadoModelo
  avisar: (t: string) => void
}

/** Distribución de P(deshidratado) por clase real: sirve para revisar si los umbrales siguen siendo adecuados. */
function Distribucion({ casos }: { casos: Caso[] }) {
  const W = 320, x0 = 92, x1 = 312
  const x = (p: number) => x0 + p * (x1 - x0)
  const filas: [ClaseReal, number][] = [['sano', 22], ['deshidratado', 52]]
  return (
    <svg viewBox={`0 0 ${W} 84`} className="distribucion-svg" role="img" aria-label="Distribución de la probabilidad de deshidratación por clase real">
      {[UMBRAL_BAJO, UMBRAL_ALTO].map((u) => (
        <line key={u} x1={x(u)} x2={x(u)} y1={8} y2={64} className="umbral-linea" />
      ))}
      <line x1={x0} x2={x1} y1={64} y2={64} className="eje" />
      {filas.map(([c, y]) => (
        <g key={c}>
          <text x={0} y={y + 4} className="etq-fila">{NOMBRE[c]}</text>
          <line x1={x0} x2={x1} y1={y} y2={y} className="guia-fila" />
          {casos.filter((k) => k.real === c).map((k, i) => (
            <circle key={i} cx={x(k.p)} cy={y + ((i % 5) - 2) * 2.2} r={3.4} className={`punto-${c}`} />
          ))}
        </g>
      ))}
      {[0, UMBRAL_BAJO, UMBRAL_ALTO, 1].map((u) => (
        <text key={u} x={x(u)} y={78} className="etq-eje" textAnchor={u === 0 ? 'start' : u === 1 ? 'end' : 'middle'}>
          {Math.round(u * 100)}
        </text>
      ))}
    </svg>
  )
}

function TablaMetricas({ m }: { m: Metricas }) {
  return (
    <>
      <div className="metricas-val">
        <div><span>Exactitud</span><b className="mono">{fmt(m.exactitud)}</b><small className="mono">{m.ic ? `IC95 ${fmt(m.ic[0], 0)}–${fmt(m.ic[1], 0)}` : ' '}</small></div>
        <div><span>Sensibilidad</span><b className="mono">{fmt(m.sensibilidad)}</b><small>deshidratados detectados</small></div>
        <div><span>Especificidad</span><b className="mono">{fmt(m.especificidad)}</b><small>sanos reconocidos</small></div>
        <div><span>Precisión</span><b className="mono">{fmt(m.precision)}</b><small>F1 {fmt(m.f1)}</small></div>
      </div>

      <div className="matriz-wrap">
        <table className="matriz">
          <caption>Matriz de confusión (umbral 50 %)</caption>
          <thead>
            <tr><th rowSpan={2} className="esquina">Real</th><th colSpan={2}>Predicción</th></tr>
            <tr><th>Sano</th><th>Deshidratado</th></tr>
          </thead>
          <tbody>
            <tr><th>Sano</th><td className="acierto">{m.tn}</td><td className="fallo">{m.fp}</td></tr>
            <tr><th>Deshidratado</th><td className="fallo">{m.fn}</td><td className="acierto">{m.tp}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        En la franja dudosa ({Math.round(UMBRAL_BAJO * 100)}–{Math.round(UMBRAL_ALTO * 100)} %): <span className="mono">{m.dudosos}</span> de <span className="mono">{m.n}</span>.
        {' '}Exactitud entre los casos decididos: <span className="mono">{fmt(m.exactitudDecididos)}</span>.
      </p>
    </>
  )
}

export function Validacion({ estadoModelo, avisar }: Props) {
  const val = useValidacion()
  const [real, setReal] = useState<ClaseReal | null>(null)
  const [frutoVista, setFrutoVista] = useState<number | null>(null) // fruto al que se agrega otra vista
  const [ultimos, setUltimos] = useState<(Registro & { entrada: string })[]>([])
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [nivel, setNivel] = useState<'foto' | 'fruto'>('foto')
  const [soloBuenas, setSoloBuenas] = useState(false)
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const usados = soloBuenas ? val.registros.filter((r) => !r.avisos?.length) : val.registros
  const casos: Caso[] = nivel === 'foto' ? usados : porFruto(usados)
  const nAvisos = val.registros.filter((r) => r.avisos?.length).length
  const m = calcular(casos)
  const nFrutos = new Set(val.registros.map((r) => r.fruto)).size
  const vistasDelFruto = frutoVista == null ? 0 : val.registros.filter((r) => r.fruto === frutoVista).length
  const enResultado = ultimos.length > 0
  const bloqueado = procesando || estadoModelo === 'error' || !real

  async function registrar(fuentes: Blob[]) {
    if (!real) return
    setError('')
    setProcesando(true)
    const nuevos: (Registro & { entrada: string })[] = []
    let fruto = frutoVista ?? val.siguienteFruto
    let vista = frutoVista == null ? 1 : vistasDelFruto + 1
    try {
      for (const f of fuentes) {
        try {
          const res = await analizarFoto(f)
          if (res.varios && frutoVista != null) {
            setError(`La foto tiene ${res.frutos.length} frutos; una vista adicional debe mostrar solo a ${idFruto(frutoVista)}.`)
            continue
          }
          // con varios frutos en la foto, cada uno se registra como un fruto distinto de la clase elegida
          const items = res.varios ? res.frutos : [res.foto]
          for (const r of items) {
            if ('error' in r) {
              val.sumarRechazo()
              continue
            }
            let avisos
            try {
              avisos = evaluarCalidad(r.medidas, { varios: res.varios })
            } catch (e) {
              if (!res.varios) throw e
              val.sumarRechazo()
              continue
            }
            const p = await clasificar(r.entrada)
            const reg = val.agregar({ fruto, vista, real, p, fecha: new Date().toISOString(), miniatura: miniaturaDe(r.entrada), avisos: avisos.map((a) => a.codigo) })
            nuevos.push({ ...reg, entrada: aDataURL(r.entrada) })
            if (frutoVista == null) fruto++
            else vista++
          }
          if (res.varios) {
            const fallidos = res.frutos.filter((x) => 'error' in x).length
            if (fallidos) setError(`${fallidos} fruto(s) de la foto no se pudieron analizar (cortados por el borde o pegados) y se contaron como rechazados.`)
          }
        } catch (e) {
          if (e instanceof ErrorFoto || e instanceof FotoNoValida) {
            val.sumarRechazo()
            setError(`Foto rechazada por el preprocesamiento: ${e.message}`)
          } else setError('No se pudo analizar la imagen: ' + (e instanceof Error ? e.message : String(e)))
        }
      }
    } finally {
      setProcesando(false)
      if (nuevos.length) setUltimos(nuevos)
    }
  }

  function alElegir(ev: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(ev.target.files || [])
    ev.target.value = ''
    if (fs.length) registrar(frutoVista == null ? fs : fs.slice(0, MAX_VISTAS - vistasDelFruto))
  }

  function siguienteFruto() {
    setUltimos([])
    setFrutoVista(null)
    setReal(null)
    setError('')
  }

  function otraVista() {
    const u = ultimos[ultimos.length - 1]
    setFrutoVista(u.fruto)
    setReal(u.real)
    setUltimos([])
    setError('')
  }

  function deshacer() {
    for (const u of ultimos) val.quitar(u.id)
    setUltimos([])
    avisar(ultimos.length > 1 ? `${ultimos.length} registros eliminados` : 'Registro eliminado')
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumenTexto(val.registros, val.rechazadas, val.condiciones))
      avisar('Resumen copiado al portapapeles')
    } catch {
      avisar('No se pudo copiar el resumen')
    }
  }

  function confirmarVaciar() {
    if (window.confirm(`¿Borrar la validación? Se eliminarán ${val.registros.length} registro(s) de este dispositivo.`)) {
      val.vaciar()
      siguienteFruto()
      avisar('Validación reiniciada')
    }
  }

  const ultimo = ultimos[ultimos.length - 1]
  const aciertosUltimos = ultimos.filter((u) => (u.p >= 0.5 ? 'deshidratado' : 'sano') === u.real).length

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Validación</h1>
          <p>Mide el desempeño del modelo con tus propias fotos. Indica la clase real de cada fruto antes de fotografiarlo; la app compara su predicción y calcula las métricas.</p>
        </div>
        {val.registros.length > 0 && (
          <div className="acciones-lote">
            <button className="btn sec peq" onClick={() => descargar(`validacion_arandanos_${new Date().toISOString().slice(0, 10)}.csv`, aCSV(val.registros, val.condiciones))}><Descargar size={16} /> Exportar CSV</button>
            <button className="btn sec peq" onClick={copiar}><Copiar size={16} /> Copiar resumen</button>
            <button className="btn peligro peq" onClick={confirmarVaciar}><Basura size={16} /> Reiniciar</button>
          </div>
        )}
      </div>

      <div className="rejilla-evaluar">
        <div>
          <div className="panel">
            <div className="panel-cab">
              <h2>{enResultado ? 'Registrado' : 'Nueva muestra'}</h2>
              <span className="meta mono">
                {enResultado ? `${ultimos.length} foto${ultimos.length > 1 ? 's' : ''}` : frutoVista != null ? `${idFruto(frutoVista)} · vista ${vistasDelFruto + 1}` : `${idFruto(val.siguienteFruto)} · vista 1`}
              </span>
            </div>
            <div className="panel-cuerpo">
              {!enResultado ? (
                <>
                  <div className="campo">
                    <span className="campo-etq">1. Clase real del fruto</span>
                    <div className="opciones-clase" role="radiogroup" aria-label="Clase real">
                      {(['sano', 'deshidratado'] as ClaseReal[]).map((c) => (
                        <button key={c} role="radio" aria-checked={real === c} className={`opcion ${c}`} onClick={() => setReal(c)} disabled={frutoVista != null || procesando}>
                          <span className="radio" />{NOMBRE[c]}
                        </button>
                      ))}
                    </div>
                    {frutoVista != null && <p className="small muted" style={{ marginTop: 6 }}>Otra vista de {idFruto(frutoVista)}: se mantiene su clase real.</p>}
                  </div>

                  <div className="campo">
                    <span className="campo-etq">2. Fotografía</span>
                    <div className="fila-btn llenar">
                      <button className="btn" onClick={() => camara.current?.click()} disabled={bloqueado}>
                        {procesando ? <span className="girando" /> : <Camara size={18} />} {procesando ? 'Analizando…' : 'Tomar foto'}
                      </button>
                      <button className="btn sec" onClick={() => galeria.current?.click()} disabled={bloqueado}><Galeria size={18} /> Subir {frutoVista == null ? 'imágenes' : 'imagen'}</button>
                    </div>
                    <p className="small muted" style={{ marginTop: 8 }}>
                      {!real ? 'Elige primero la clase real; queda fijada antes de ver la predicción.' : frutoVista == null ? 'Puedes subir varias imágenes o una foto con varios frutos separados: cada fruto cuenta por separado con la clase elegida.' : 'Se agregará como otra vista del mismo fruto.'}
                    </p>
                    {frutoVista != null && (
                      <button className="enlace small" style={{ marginTop: 6 }} onClick={siguienteFruto}>Cancelar y pasar a un fruto nuevo</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="resultado-val">
                    <img src={ultimo.entrada} alt="Imagen analizada" />
                    <dl className="datos" style={{ marginTop: 0 }}>
                      <dt>Fruto</dt><dd className="mono">{idFruto(ultimo.fruto)} · V{ultimo.vista}</dd>
                      <dt>Clase real</dt><dd>{NOMBRE[ultimo.real]}</dd>
                      <dt>Predicción</dt><dd>{ultimo.p >= 0.5 ? 'Deshidratado' : 'Sano'} <span className="mono muted">({pct(ultimo.p)})</span></dd>
                      <dt>Resultado</dt>
                      <dd>{(ultimo.p >= 0.5 ? 'deshidratado' : 'sano') === ultimo.real ? <span className="calidad ok">Acierto</span> : <span className="calidad mal">Error</span>}</dd>
                      <dt>Calidad</dt>
                      <dd>{ultimo.avisos?.length ? <span className="calidad duda">Con advertencias</span> : <span className="calidad ok">Adecuada</span>}</dd>
                    </dl>
                  </div>
                  {ultimo.avisos && ultimo.avisos.length > 0 && (
                    <p className="small muted" style={{ marginTop: 10 }}>Advertencias: {ultimo.avisos.map((a) => ETIQUETA_AVISO[a]).join(', ')}. El registro se conserva y queda marcado en el CSV; puedes excluir estas fotos de las métricas.</p>
                  )}
                  {ultimos.length > 1 && (
                    <p className="small" style={{ marginTop: 10 }}>Se registraron <b className="mono">{ultimos.length}</b> fotos: <b className="mono">{aciertosUltimos}</b> aciertos. Arriba se muestra la última.</p>
                  )}
                  <div className="fila-btn llenar" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={siguienteFruto}>Siguiente fruto</button>
                    {ultimos.length === 1 && ultimo.vista < MAX_VISTAS && <button className="btn sec" onClick={otraVista}>Otra vista de {idFruto(ultimo.fruto)}</button>}
                  </div>
                  <button className="enlace small" style={{ marginTop: 10 }} onClick={deshacer}>Deshacer este registro</button>
                </>
              )}

              <input ref={camara} className="sr" type="file" accept="image/*" capture="environment" onChange={alElegir} tabIndex={-1} />
              <input ref={galeria} className="sr" type="file" accept="image/*" multiple={frutoVista == null} onChange={alElegir} tabIndex={-1} />
              {error && <div className="nota error" role="alert" style={{ marginTop: 12 }}><Alerta size={16} /><span>{error}</span></div>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-cab"><h2>Condiciones de captura</h2></div>
            <div className="panel-cuerpo">
              <label className="campo-etq" htmlFor="condiciones">Dispositivo, iluminación y fondo (se incluye en el CSV)</label>
              <input
                id="condiciones" className="entrada" type="text" value={val.condiciones} maxLength={160}
                placeholder="Ej.: Samsung A54, luz de ventana, cartulina gris"
                onChange={(e) => val.setCondiciones(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-cab">
              <h2>Métricas</h2>
              <div className="segmento" role="group" aria-label="Nivel de evaluación">
                <button aria-pressed={nivel === 'foto'} onClick={() => setNivel('foto')}>Por foto</button>
                <button aria-pressed={nivel === 'fruto'} onClick={() => setNivel('fruto')}>Por fruto</button>
              </div>
            </div>
            <div className="panel-cuerpo">
              {!val.registros.length ? (
                <p className="muted small">Aún no hay registros. Las métricas aparecerán aquí a medida que valides frutos. Se recomiendan al menos 30 frutos de cada clase.</p>
              ) : (
                <>
                  <p className="small muted" style={{ marginBottom: 12 }}>
                    <span className="mono">{val.registros.length}</span> fotos de <span className="mono">{nFrutos}</span> frutos ·
                    {' '}<span className="mono">{val.registros.filter((r) => r.real === 'sano').length}</span> sanas,
                    {' '}<span className="mono">{val.registros.filter((r) => r.real === 'deshidratado').length}</span> deshidratadas ·
                    {' '}<span className="mono">{nAvisos}</span> con advertencias · <span className="mono">{val.rechazadas}</span> rechazadas
                  </p>
                  {nAvisos > 0 && (
                    <label className="check" style={{ marginBottom: 12 }}>
                      <input type="checkbox" checked={soloBuenas} onChange={(e) => setSoloBuenas(e.target.checked)} />
                      Calcular solo con fotos sin advertencias de calidad
                    </label>
                  )}
                  <TablaMetricas m={m} />
                  <h3 className="sub">Distribución de P(deshidratado)</h3>
                  <Distribucion casos={casos} />
                  <p className="small muted">Cada punto es {nivel === 'foto' ? 'una foto' : 'un fruto'}. Las líneas marcan los umbrales {Math.round(UMBRAL_BAJO * 100)} % y {Math.round(UMBRAL_ALTO * 100)} %. Si los puntos de ambas clases se mezclan cerca del centro, conviene revisar los umbrales o las condiciones de la foto.</p>
                </>
              )}
            </div>
          </div>

          {val.registros.length > 0 && (
            <div className="panel">
              <div className="panel-cab"><h2>Registros</h2><span className="meta">más recientes primero</span></div>
              <div className="registros-scroll">
                <table className="tabla-lote">
                  <thead>
                    <tr>
                      <th className="img-col"><span className="sr">Imagen</span></th>
                      <th>Fruto</th>
                      <th>Real</th>
                      <th className="r">P(desh.)</th>
                      <th>Resultado</th>
                      <th className="acc-col"><span className="sr">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {val.registros.slice().reverse().map((r) => {
                      const ok = (r.p >= 0.5 ? 'deshidratado' : 'sano') === r.real
                      return (
                        <tr key={r.id}>
                          <td><img src={r.miniatura} alt="" /></td>
                          <td className="mono">{idFruto(r.fruto)}<span className="muted">·V{r.vista}</span></td>
                          <td>{NOMBRE[r.real]}</td>
                          <td className="r mono">{pct(r.p)}</td>
                          <td>
                            {ok ? <span className="calidad ok">Acierto</span> : <span className="calidad mal">Error</span>}
                            {r.avisos && r.avisos.length > 0 && <span className="aviso-mini" title={r.avisos.map((a) => ETIQUETA_AVISO[a]).join(', ')}>calidad</span>}
                          </td>
                          <td><button className="icon-btn" onClick={() => val.quitar(r.id)} aria-label={`Eliminar registro de ${idFruto(r.fruto)}`}><Basura size={16} /></button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="pie">Métricas con umbral de 50 % y deshidratado como clase positiva, igual que en el cuaderno de entrenamiento. Los registros se guardan solo en este dispositivo.</p>
    </>
  )
}
