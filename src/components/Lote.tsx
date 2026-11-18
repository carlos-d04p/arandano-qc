import { useEffect, useState } from 'react'
import { aCSV, descargar, dictamen, esDefectuoso, nombresDefectos, resumen, type DatosLote, type Dictamen, type FrutoGuardado } from '../lib/lote'
import { fmt } from '../lib/validacion'
import { pct, veredictoFinal } from '../lib/veredicto'
import { Basura, Copiar, Descargar, Imprimir, Logo } from './Iconos'

interface Props {
  lote: FrutoGuardado[]
  datos: DatosLote
  cambiar: <K extends keyof DatosLote>(k: K, v: DatosLote[K]) => void
  quitar: (n: number) => void
  nuevoLote: () => void
  avisar: (t: string) => void
  irAAnalizar: () => void
}

const id = (n: number) => String(n).padStart(3, '0')
const hora = (f: string) => new Date(f).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

const TITULO: Record<Dictamen['estado'], string> = {
  vacio: 'Sin muestras',
  insuficiente: 'Muestra insuficiente',
  aceptado: 'Lote aceptado',
  rechazado: 'Lote rechazado',
}

function textoDictamen(dc: Dictamen, d: DatosLote, total: number): string {
  if (dc.estado === 'vacio') return 'Evalúa frutos y guárdalos en el lote para obtener el dictamen.'
  const base =
    `Defectuosos: ${dc.defectuosos} de ${dc.n} (${fmt(dc.tasa)}; IC 95 % ${dc.ic ? `${fmt(dc.ic[0])} – ${fmt(dc.ic[1])}` : '—'}). ` +
    `Tolerancia: ${d.tolerancia} %.`
  if (dc.estado === 'insuficiente')
    return `${base} Faltan ${d.minimo - total} fruto(s) para el mínimo de ${d.minimo}; hasta entonces el resultado es provisional.`
  if (dc.limite) return `${base} La tasa está dentro de la tolerancia, pero el intervalo de confianza la supera: conviene ampliar la muestra.`
  return base
}

const fechaLarga = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')

export function Lote({ lote, datos, cambiar, quitar, nuevoLote, avisar, irAAnalizar }: Props) {
  const r = resumen(lote)
  const dc = dictamen(lote, datos)
  const ancho = (n: number) => `${r.total ? (100 * n) / r.total : 0}%`
  const nombre = datos.codigo.trim() || 'sin código'
  const archivo = () => `lote_${(datos.codigo.trim() || 'arandanos').replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`

  async function copiar() {
    const txt = [
      `Lote ${nombre} · ${new Date().toLocaleString('es')}`,
      [datos.productor && `Productor: ${datos.productor}`, datos.variedad && `Variedad: ${datos.variedad}`, datos.fecha && `Fecha: ${fechaLarga(datos.fecha)}`, datos.responsable && `Responsable: ${datos.responsable}`]
        .filter(Boolean)
        .join(' · '),
      `${TITULO[dc.estado]}. ${textoDictamen(dc, datos, r.total)}`,
      `Muestras: ${r.total} · Cumplen: ${r.ok} · Dudosas: ${r.duda} · No cumplen: ${r.mal} · Con otros defectos: ${r.otros}`,
      '',
      ...lote.map((f) => `${id(f.n)}\t${f.vistas} vista(s)\t${pct(f.p)}\t${veredictoFinal(f.p, f.defectos)!.corto}${f.defectos?.length ? `\t${nombresDefectos(f.defectos)}` : ''}`),
    ].filter((l, i) => l || i > 2)
    try {
      await navigator.clipboard.writeText(txt.join('\n'))
      avisar('Resumen copiado al portapapeles')
    } catch {
      avisar('No se pudo copiar el resumen')
    }
  }

  function confirmarNuevo() {
    if (window.confirm(`¿Empezar un lote nuevo? Se eliminarán ${r.total} muestra(s) y el código del lote. Se conservan el productor, el responsable y el criterio.`)) {
      nuevoLote()
      avisar('Lote nuevo iniciado')
    }
  }

  const campo = (k: 'codigo' | 'productor' | 'variedad' | 'responsable' | 'notas', etq: string, ph: string) => (
    <label className="campo-form">
      <span>{etq}</span>
      <input className="entrada" value={datos[k]} placeholder={ph} onChange={(e) => cambiar(k, e.target.value)} />
    </label>
  )

  return (
    <>
      <div className="solo-pantalla">
        <div className="cab-pagina">
          <div>
            <h1>Lote</h1>
            <p>Muestras guardadas en este dispositivo, dictamen según el criterio de aceptación e informe imprimible.</p>
          </div>
          {r.total > 0 && (
            <div className="acciones-lote">
              <button className="btn sec peq" onClick={() => window.print()}><Imprimir size={16} /> Informe PDF</button>
              <button className="btn sec peq" onClick={() => descargar(`${archivo()}.csv`, aCSV(lote, datos))}><Descargar size={16} /> CSV</button>
              <button className="btn sec peq" onClick={copiar}><Copiar size={16} /> Copiar</button>
              <button className="btn peligro peq" onClick={confirmarNuevo}><Basura size={16} /> Nuevo lote</button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className={`dictamen ${dc.estado}`} aria-live="polite">
            <div className="etq">Dictamen · lote {nombre}</div>
            <h3>{TITULO[dc.estado]}</h3>
            <p>{textoDictamen(dc, datos, r.total)}</p>
          </div>
          <div className="cifras">
            <div className="cifra"><span>Muestras</span><b>{r.total}</b></div>
            <div className="cifra ok"><span>Cumplen</span><b>{r.ok}</b></div>
            <div className="cifra duda"><span>Dudosas o a revisar</span><b>{r.duda}</b></div>
            <div className="cifra mal"><span>No cumplen</span><b>{r.mal}</b></div>
          </div>
          <div className="distribucion">
            <div className="barra-lote" role="img" aria-label={`Cumplen ${r.ok}, dudosas ${r.duda}, no cumplen ${r.mal}`}>
              <i className="ok" style={{ width: ancho(r.ok) }} />
              <i className="duda" style={{ width: ancho(r.duda) }} />
              <i className="mal" style={{ width: ancho(r.mal) }} />
            </div>
            <div className="leyenda">
              <span className="calidad ok">Cumple</span>
              <span className="calidad duda">Dudoso / revisar</span>
              <span className="calidad mal">No cumple</span>
              <span className="small muted" style={{ marginLeft: 'auto' }}>Con otros defectos: <span className="mono">{r.otros}</span></span>
            </div>
          </div>
        </div>

        <div className="dos-col lote-config">
          <div className="panel">
            <div className="panel-cab"><h2>Datos del lote</h2></div>
            <div className="panel-cuerpo form-lote">
              {campo('codigo', 'Código de lote', 'Ej. L-2026-118')}
              {campo('productor', 'Productor o proveedor', 'Nombre o código')}
              {campo('variedad', 'Variedad', 'Ej. Biloxi')}
              <label className="campo-form">
                <span>Fecha de muestreo</span>
                <input className="entrada" type="date" value={datos.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
              </label>
              {campo('responsable', 'Responsable', 'Nombre del inspector')}
              {campo('notas', 'Observaciones', 'Opcional')}
            </div>
          </div>

          <div className="panel">
            <div className="panel-cab"><h2>Criterio de aceptación</h2></div>
            <div className="panel-cuerpo form-lote">
              <label className="campo-form">
                <span>Tolerancia máxima de defectuosos (%)</span>
                <input className="entrada" type="number" inputMode="decimal" min={0} max={100} step={0.5} value={datos.tolerancia}
                  onChange={(e) => cambiar('tolerancia', Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
              </label>
              <label className="campo-form">
                <span>Tamaño mínimo de muestra (frutos)</span>
                <input className="entrada" type="number" inputMode="numeric" min={1} max={1000} step={1} value={datos.minimo}
                  onChange={(e) => cambiar('minimo', Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1))))} />
              </label>
              <label className="campo-form ancho">
                <span>Resultados dudosos o a revisar</span>
                <select className="entrada" value={datos.dudosos} onChange={(e) => cambiar('dudosos', e.target.value as DatosLote['dudosos'])}>
                  <option value="defectuoso">Cuentan como defectuosos (criterio conservador)</option>
                  <option value="excluir">Se excluyen del cálculo</option>
                </select>
              </label>
              <label className="check ancho">
                <input type="checkbox" checked={datos.contarOtros} onChange={(e) => cambiar('contarOtros', e.target.checked)} />
                Contar los frutos con otros defectos (experimental) como defectuosos
              </label>
              <p className="small muted ancho">
                El lote se acepta si el porcentaje de defectuosos no supera la tolerancia. Ajusta los valores al estándar o contrato que apliques.
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          {!r.total ? (
            <div className="vacio-estado">
              <h3>Todavía no hay muestras</h3>
              <p>Evalúa un fruto y pulsa «Guardar en el lote» para registrarlo aquí.</p>
              <button className="btn" onClick={irAAnalizar}>Evaluar una muestra</button>
            </div>
          ) : (
            <table className="tabla-lote">
              <thead>
                <tr>
                  <th className="img-col"><span className="sr">Imagen</span></th>
                  <th>Muestra</th>
                  <th className="col-hora">Hora</th>
                  <th className="col-vistas r">Vistas</th>
                  <th className="r">P(desh.)</th>
                  <th>Resultado</th>
                  <th className="acc-col"><span className="sr">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lote.slice().reverse().map((f) => {
                  const v = veredictoFinal(f.p, f.defectos)!
                  return (
                    <tr key={f.n}>
                      <td><img src={f.miniatura} alt="" /></td>
                      <td className="mono">{id(f.n)}</td>
                      <td className="col-hora mono muted">{hora(f.fecha)}</td>
                      <td className="col-vistas r mono">{f.vistas}</td>
                      <td className="r mono">{pct(f.p)}</td>
                      <td>
                        <span className={`calidad ${v.clase}`}>{v.corto}</span>
                        {f.defectos && f.defectos.length > 0 && <span className="defecto-mini" title={nombresDefectos(f.defectos)}>otros defectos</span>}
                        {f.avisos && f.avisos.length > 0 && <span className="aviso-mini" title="Foto con advertencias de calidad">foto</span>}
                      </td>
                      <td><button className="icon-btn" onClick={() => quitar(f.n)} aria-label={`Eliminar muestra ${f.n}`}><Basura size={16} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="pie">Los datos se guardan solo en este dispositivo y no se envían a ningún servidor.</p>
      </div>

      {r.total > 0 && <Informe lote={lote} datos={datos} dc={dc} r={r} />}
    </>
  )
}

/** Versión para imprimir o guardar como PDF (solo visible al imprimir). */
function Informe({ lote, datos, dc, r }: { lote: FrutoGuardado[]; datos: DatosLote; dc: Dictamen; r: ReturnType<typeof resumen> }) {
  const [generado, setGenerado] = useState(() => new Date())
  useEffect(() => {
    const f = () => setGenerado(new Date())
    window.addEventListener('beforeprint', f)
    return () => window.removeEventListener('beforeprint', f)
  }, [])
  const fila = (t: string, v: string) => (v ? <tr><th>{t}</th><td>{v}</td></tr> : null)
  return (
    <section className="informe" aria-hidden="true">
      <header className="inf-cab">
        <Logo size={30} />
        <div>
          <h1>Informe de control de calidad · Arándanos</h1>
          <p>Lote {datos.codigo.trim() || 'sin código'} · generado el {generado.toLocaleString('es')}</p>
        </div>
      </header>

      <div className="inf-dos">
        <table className="inf-datos">
          <tbody>
            {fila('Código de lote', datos.codigo)}
            {fila('Productor / proveedor', datos.productor)}
            {fila('Variedad', datos.variedad)}
            {fila('Fecha de muestreo', datos.fecha ? fechaLarga(datos.fecha) : '')}
            {fila('Responsable', datos.responsable)}
            {fila('Observaciones', datos.notas)}
          </tbody>
        </table>
        <table className="inf-datos">
          <tbody>
            <tr><th>Tolerancia</th><td>{datos.tolerancia} % de defectuosos</td></tr>
            <tr><th>Muestra mínima</th><td>{datos.minimo} frutos</td></tr>
            <tr><th>Dudosos</th><td>{datos.dudosos === 'defectuoso' ? 'Cuentan como defectuosos' : 'Excluidos del cálculo'}</td></tr>
            <tr><th>Otros defectos</th><td>{datos.contarOtros ? 'Cuentan como defectuosos' : 'Informativos'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className={`inf-dictamen ${dc.estado}`}>
        <b>{TITULO[dc.estado]}</b>
        <span>{textoDictamen(dc, datos, r.total)}</span>
      </div>

      <p className="inf-cifras">
        Muestras: <b>{r.total}</b> · Cumplen: <b>{r.ok}</b> · Dudosas: <b>{r.duda}</b> · No cumplen: <b>{r.mal}</b> · Con otros defectos: <b>{r.otros}</b>
      </p>

      <table className="inf-tabla">
        <thead>
          <tr><th>Muestra</th><th>Hora</th><th className="r">Vistas</th><th className="r">P(desh.)</th><th>Resultado</th><th>Otros defectos</th><th>Calidad de foto</th><th>Defectuoso</th></tr>
        </thead>
        <tbody>
          {lote.map((f) => (
            <tr key={f.n}>
              <td>{id(f.n)}</td>
              <td>{hora(f.fecha)}</td>
              <td className="r">{f.vistas}</td>
              <td className="r">{pct(f.p)}</td>
              <td>{veredictoFinal(f.p, f.defectos)!.corto}</td>
              <td>{nombresDefectos(f.defectos) || '—'}</td>
              <td>{f.avisos?.length ? 'Con advertencias' : 'Adecuada'}</td>
              <td>{esDefectuoso(f, datos) ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="inf-pie">
        BerryScan · YOLOv11n-cls ejecutado en el dispositivo. Criterio de deshidratación: P &lt; 35 % cumple, 35–65 % dudoso, ≥ 65 % no cumple.
        La inspección de otros defectos es experimental. Herramienta de apoyo que no sustituye la inspección oficial de calidad.
      </footer>
    </section>
  )
}
