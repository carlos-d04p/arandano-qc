import { UMBRAL_ALTO, UMBRAL_BAJO } from '../lib/veredicto'

export function Escala({ p }: { p: number | null }) {
  return (
    <div className="escala" aria-hidden={p == null}>
      <div className="escala-barra">
        <i /><i /><i />
        {p != null && <span className="aguja" style={{ left: `${Math.min(98, Math.max(2, p * 100))}%` }} />}
      </div>
      <div className="escala-etq">
        <span>0 % · Sano</span>
        <span>{Math.round(UMBRAL_BAJO * 100)}–{Math.round(UMBRAL_ALTO * 100)} % dudoso</span>
        <span>Deshidratado · 100 %</span>
      </div>
    </div>
  )
}
