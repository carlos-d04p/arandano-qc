import { aCSV, descargar, resumen, type FrutoGuardado } from '../lib/lote'
import { pct, veredicto } from '../lib/veredicto'
import { Basura, Copiar, Descargar } from './Iconos'

interface Props {
  lote: FrutoGuardado[]
  quitar: (n: number) => void
  vaciar: () => void
  avisar: (t: string) => void
  irAAnalizar: () => void
}

const id = (n: number) => String(n).padStart(3, '0')

export function Lote({ lote, quitar, vaciar, avisar, irAAnalizar }: Props) {
  const r = resumen(lote)
  const ancho = (n: number) => `${r.total ? (100 * n) / r.total : 0}%`

  async function copiar() {
    const txt =
      `Lote de arándanos · ${new Date().toLocaleString('es')}\n` +
      `Muestras: ${r.total} · Cumplen: ${r.ok} · Dudosas: ${r.duda} · No cumplen: ${r.mal} (${pct(r.pctMal)})\n\n` +
      lote.map((f) => `${id(f.n)}\t${f.vistas} vista(s)\t${pct(f.p)}\t${veredicto(f.p)!.corto}`).join('\n')
    try {
      await navigator.clipboard.writeText(txt)
      avisar('Resumen copiado al portapapeles')
    } catch {
      avisar('No se pudo copiar el resumen')
    }
  }

  function exportar() {
    descargar(`lote_arandanos_${new Date().toISOString().slice(0, 10)}.csv`, aCSV(lote))
  }

  function confirmarVaciar() {
    if (window.confirm(`¿Vaciar el lote? Se eliminarán ${r.total} muestra(s) guardadas en este dispositivo.`)) {
      vaciar()
      avisar('Lote vaciado')
    }
  }

  return (
    <>
      <div className="cab-pagina">
        <div>
          <h1>Lote</h1>
          <p>Muestras guardadas en este dispositivo y proporción de frutos defectuosos.</p>
        </div>
        {r.total > 0 && (
          <div className="acciones-lote">
            <button className="btn sec peq" onClick={exportar}><Descargar size={16} /> Exportar CSV</button>
            <button className="btn sec peq" onClick={copiar}><Copiar size={16} /> Copiar</button>
            <button className="btn peligro peq" onClick={confirmarVaciar}><Basura size={16} /> Vaciar</button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="cifras">
          <div className="cifra"><span>Muestras</span><b>{r.total}</b></div>
          <div className="cifra ok"><span>Cumplen</span><b>{r.ok}</b></div>
          <div className="cifra duda"><span>Dudosas</span><b>{r.duda}</b></div>
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
            <span className="calidad duda">Dudoso</span>
            <span className="calidad mal">No cumple</span>
            <span className="small muted" style={{ marginLeft: 'auto' }}>Defectuoso: <span className="mono">{pct(r.pctMal)}</span></span>
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
                const v = veredicto(f.p)!
                return (
                  <tr key={f.n}>
                    <td><img src={f.miniatura} alt="" /></td>
                    <td className="mono">{id(f.n)}</td>
                    <td className="col-hora mono muted">{new Date(f.fecha).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="col-vistas r mono">{f.vistas}</td>
                    <td className="r mono">{pct(f.p)}</td>
                    <td><span className={`calidad ${v.clase}`}>{v.corto}</span></td>
                    <td><button className="icon-btn" onClick={() => quitar(f.n)} aria-label={`Eliminar muestra ${f.n}`}><Basura size={16} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="pie">Los datos se guardan solo en este dispositivo y no se envían a ningún servidor.</p>
    </>
  )
}
