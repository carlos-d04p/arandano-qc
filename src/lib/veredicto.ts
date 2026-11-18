// Regla de decisión: probabilidad de deshidratado → calidad del fruto.
export const UMBRAL_BAJO = 0.35
export const UMBRAL_ALTO = 0.65

export type Clase = 'ok' | 'duda' | 'mal'

export interface Veredicto {
  clase: Clase
  titulo: string
  corto: string
  detalle: string
}

export function veredicto(p: number | null): Veredicto | null {
  if (p == null) return null
  if (p >= UMBRAL_ALTO)
    return { clase: 'mal', titulo: 'No cumple', corto: 'No cumple', detalle: 'Arrugamiento visible: fruto deshidratado.' }
  if (p <= UMBRAL_BAJO)
    return { clase: 'ok', titulo: 'Cumple', corto: 'Cumple', detalle: 'Piel lisa: fruto sano.' }
  return { clase: 'duda', titulo: 'Dudoso', corto: 'Dudoso', detalle: 'El modelo no está seguro: revísalo a mano.' }
}

export const pct = (p: number) => `${Math.round(p * 100)} %`

export function promedio(ps: number[]): number | null {
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null
}
