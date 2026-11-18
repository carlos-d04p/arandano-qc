import { aCSV, descargar, resumen, type FrutoGuardado } from '../lib/lote'
import { pct, veredicto } from '../lib/veredicto'
import { Basura, Copiar, Descargar, Lista, Mas } from './Iconos'

interface Props {
  lote: FrutoGuardado[]
  quitar: (n: number) => void
  vaciar: () => void
  avisar: (t: string) => void
  irAAnalizar: () => void
}

export function Lote({ lote, quitar, vaciar, avisar, irAAnalizar }: Props) {
  const r = resumen(lote)
  const ancho = (n: number) => `${r.total ? (100 * n) / r.total : 0}%`

  async function copiar() {
    const txt =
      `Lote de arándanos · ${new Date().toLocaleString('es')}\n` +
      `Frutos: ${r.total} · Cumplen: ${r.ok} · Dudosos: ${r.duda} · No cumplen: ${r.mal} (${pct(r.pctMal)})\n\n` +
      lote.map((f) => `#${f.n}\t${f.vistas} vista(s)\tP(desh) ${pct(f.p)}\t${veredicto(f.p)!.corto}`).join('\n')
    try {
      await navigator.clipboard.writeText(txt)
      avisar('Resumen copiado al portapapeles')
    } catch {
      avisar('No se pudo copiar automáticamente')
    }
  }

  function exportar() {
    const fecha = new Date().toISOString().slice(0, 10)
    descargar(`lote_arandanos_${fecha}.csv`, aCSV(lote))
  }

  function confirmarVaciar() {
    if (window.confirm(`¿Vaciar el lote? Se borrarán ${r.total} fruto(s) guardados en este dispositivo.`)) {
      vaciar()
      avisar('Lote vaciado')
    }
  }

  return (
    <div className="pila">
      <section className="tarjeta">
        <div className="tarjeta-cab">
          <div>
            <div className="eyebrow">Resumen del lote</div>
            <h2>{r.total ? `${pct(r.pctMal)} defectuoso` : 'Lote vacío'}</h2>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi"><span>Frutos</span><b className="num">{r.total}</b></div>
          <div className="kpi ok"><span>Cumplen</span><b className="num">{r.ok}</b></div>
          <div className="kpi duda"><span>Dudosos</span><b className="num">{r.duda}</b></div>
          <div className="kpi mal"><span>No cumplen</span><b className="num">{r.mal}</b></div>
        </div>
        <div className="barra-lote" role="img" aria-label={`Cumplen ${r.ok}, dudosos ${r.duda}, no cumplen ${r.mal}`}>
          <i className="ok" style={{ width: ancho(r.ok) }} />
          <i className="duda" style={{ width: ancho(r.duda) }} />
          <i className="mal" style={{ width: ancho(r.mal) }} />
        </div>
        <div className="leyenda"><span className="ok">Cumple</span><span className="duda">Dudoso (revisar a mano)</span><span className="mal">No cumple</span></div>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab">
          <h2>Frutos evaluados</h2>
          {r.total > 0 && <span className="muted small">más recientes primero</span>}
        </div>

        {!r.total ? (
          <div className="vacio-estado">
            <Lista size={34} />
            <h3>Aún no hay frutos guardados</h3>
            <p className="small">Analiza un arándano y pulsa «Guardar y siguiente» para sumarlo al lote.</p>
            <button className="btn" style={{ marginTop: 14 }} onClick={irAAnalizar}><Mas /> Analizar un fruto</button>
          </div>
        ) : (
          <>
            <ul className="lista">
              {lote.slice().reverse().map((f) => {
                const v = veredicto(f.p)!
                return (
                  <li key={f.n}>
                    <img src={f.miniatura} alt="" />
                    <div className="info">
                      <b className="num">Fruto #{f.n}</b>
                      <p>{f.vistas} vista{f.vistas > 1 ? 's' : ''} · {new Date(f.fecha).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="der">
                      <span className={`chip ${v.clase}`}>{v.corto}</span>
                      <span className="p num">{pct(f.p)}</span>
                    </div>
                    <button className="icon-btn" onClick={() => quitar(f.n)} aria-label={`Eliminar fruto ${f.n}`}><Basura size={17} /></button>
                  </li>
                )
              })}
            </ul>
            <div className="fila-btn" style={{ marginTop: 14 }}>
              <button className="btn sec peq" onClick={exportar}><Descargar size={17} /> Exportar CSV</button>
              <button className="btn sec peq" onClick={copiar}><Copiar size={17} /> Copiar resumen</button>
              <button className="btn peligro peq" onClick={confirmarVaciar}><Basura size={17} /> Vaciar lote</button>
            </div>
          </>
        )}
      </section>
      <p className="pie">El lote se guarda solo en este dispositivo. Ninguna foto ni resultado se envía a un servidor.</p>
    </div>
  )
}
