import { UMBRAL_ALTO, UMBRAL_BAJO } from '../lib/veredicto'

export function Escala({ p }: { p: number | null }) {
  const bajo = Math.round(UMBRAL_BAJO * 100)
  const alto = Math.round(UMBRAL_ALTO * 100)
  return (
    <div className="escala" aria-hidden="true">
      <div className="escala-barra">
        <i /><i /><i />
        {p != null && <span className="aguja" style={{ left: `${Math.min(99.6, Math.max(0.4, p * 100))}%` }} />}
      </div>
      <div className="escala-etq">
        <span style={{ left: 0 }}>0</span>
        <span style={{ left: `${bajo}%` }}>{bajo}</span>
        <span style={{ left: `${alto}%` }}>{alto}</span>
        <span style={{ left: '100%' }}>100</span>
      </div>
    </div>
  )
}
