// Modo validación: el usuario indica la clase real de cada fruto antes de fotografiarlo
// y la app acumula las métricas del modelo con esas fotos (positivo = deshidratado).
import { useCallback, useEffect, useState } from 'react'
import { UMBRAL_ALTO, UMBRAL_BAJO, veredicto } from './veredicto'

export type ClaseReal = 'sano' | 'deshidratado'

export interface Registro {
  id: number
  fruto: number
  vista: number
  real: ClaseReal
  p: number
  fecha: string
  miniatura: string
}

interface Estado {
  registros: Registro[]
  rechazadas: number
  condiciones: string
}

const CLAVE = 'arandanos-qc:validacion:v1'
let contador = 0
const VACIO: Estado = { registros: [], rechazadas: 0, condiciones: '' }

function leer(): Estado {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    return v && Array.isArray(v.registros) ? { ...VACIO, ...v } : VACIO
  } catch {
    return VACIO
  }
}

export function useValidacion() {
  const [estado, setEstado] = useState<Estado>(leer)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(estado))
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [estado])

  const agregar = useCallback((r: Omit<Registro, 'id'>): Registro => {
    const nuevo = { ...r, id: Date.now() * 100 + (contador++ % 100) }
    setEstado((e) => ({ ...e, registros: [...e.registros, nuevo] }))
    return nuevo
  }, [])

  const quitar = useCallback((id: number) => setEstado((e) => ({ ...e, registros: e.registros.filter((r) => r.id !== id) })), [])
  const sumarRechazo = useCallback(() => setEstado((e) => ({ ...e, rechazadas: e.rechazadas + 1 })), [])
  const setCondiciones = useCallback((condiciones: string) => setEstado((e) => ({ ...e, condiciones })), [])
  const vaciar = useCallback(() => setEstado((e) => ({ ...VACIO, condiciones: e.condiciones })), [])

  const siguienteFruto = estado.registros.length ? Math.max(...estado.registros.map((r) => r.fruto)) + 1 : 1

  return { ...estado, siguienteFruto, agregar, quitar, sumarRechazo, setCondiciones, vaciar }
}

export interface Caso {
  real: ClaseReal
  p: number
}

/** Agrupa las vistas de cada fruto promediando P(deshidratado), como en el cuaderno de Colab. */
export function porFruto(regs: Registro[]): Caso[] {
  const m = new Map<number, Registro[]>()
  for (const r of regs) m.set(r.fruto, [...(m.get(r.fruto) || []), r])
  return [...m.values()].map((vs) => ({ real: vs[0].real, p: vs.reduce((a, b) => a + b.p, 0) / vs.length }))
}

export interface Metricas {
  n: number
  tp: number
  fp: number
  tn: number
  fn: number
  exactitud: number | null
  ic: [number, number] | null
  precision: number | null
  sensibilidad: number | null
  especificidad: number | null
  f1: number | null
  dudosos: number
  exactitudDecididos: number | null
}

const div = (a: number, b: number) => (b ? a / b : null)

/** Intervalo de confianza de Wilson al 95 % para una proporción. */
export function wilson(aciertos: number, n: number): [number, number] | null {
  if (!n) return null
  const z = 1.96
  const p = aciertos / n
  const den = 1 + (z * z) / n
  const centro = (p + (z * z) / (2 * n)) / den
  const mitad = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  return [Math.max(0, centro - mitad), Math.min(1, centro + mitad)]
}

/** Métricas binarias con umbral 0,5 (igual que la evaluación del cuaderno) y resumen de la franja dudosa. */
export function calcular(casos: Caso[]): Metricas {
  let tp = 0, fp = 0, tn = 0, fn = 0, dudosos = 0, decOk = 0
  for (const c of casos) {
    const pos = c.real === 'deshidratado'
    const pred = c.p >= 0.5
    if (pos && pred) tp++
    else if (!pos && pred) fp++
    else if (!pos && !pred) tn++
    else fn++
    if (c.p > UMBRAL_BAJO && c.p < UMBRAL_ALTO) dudosos++
    else if (pos === c.p >= UMBRAL_ALTO) decOk++
  }
  const n = casos.length
  const precision = div(tp, tp + fp)
  const sensibilidad = div(tp, tp + fn)
  return {
    n, tp, fp, tn, fn,
    exactitud: div(tp + tn, n),
    ic: wilson(tp + tn, n),
    precision,
    sensibilidad,
    especificidad: div(tn, tn + fp),
    f1: precision != null && sensibilidad != null && precision + sensibilidad > 0 ? (2 * precision * sensibilidad) / (precision + sensibilidad) : null,
    dudosos,
    exactitudDecididos: div(decOk, n - dudosos),
  }
}

export const fmt = (x: number | null, dec = 1) => (x == null ? '—' : `${(x * 100).toFixed(dec).replace('.', ',')} %`)
export const idFruto = (n: number) => `F${String(n).padStart(3, '0')}`

export function aCSV(regs: Registro[], condiciones: string): string {
  const cond = condiciones.replace(/[;\n\r]+/g, ' ').trim()
  const filas = regs.map((r, i) => {
    const pred = r.p >= 0.5 ? 'deshidratado' : 'sano'
    return [
      i + 1, idFruto(r.fruto), `V${r.vista}`, r.real, r.p.toFixed(4), pred, veredicto(r.p)!.corto,
      pred === r.real ? 1 : 0, new Date(r.fecha).toLocaleString('es'), cond,
    ].join(';')
  })
  return ['muestra;fruto;vista;clase_real;p_deshidratado;prediccion_05;veredicto;acierto;fecha;condiciones', ...filas].join('\n')
}

export function resumenTexto(regs: Registro[], rechazadas: number, condiciones: string): string {
  const linea = (t: string, m: Metricas) =>
    `${t} (n = ${m.n}): exactitud ${fmt(m.exactitud)} [IC95 ${m.ic ? `${fmt(m.ic[0])} – ${fmt(m.ic[1])}` : '—'}], ` +
    `precisión ${fmt(m.precision)}, sensibilidad ${fmt(m.sensibilidad)}, especificidad ${fmt(m.especificidad)}, F1 ${fmt(m.f1)}. ` +
    `Matriz [[VN ${m.tn}, FP ${m.fp}], [FN ${m.fn}, VP ${m.tp}]]. Dudosos (${Math.round(UMBRAL_BAJO * 100)}–${Math.round(UMBRAL_ALTO * 100)} %): ${m.dudosos}.`
  return [
    `Validación de Arándano QC · ${new Date().toLocaleString('es')}`,
    condiciones ? `Condiciones: ${condiciones}` : '',
    linea('Por foto', calcular(regs)),
    linea('Por fruto', calcular(porFruto(regs))),
    `Fotos rechazadas por el preprocesamiento: ${rechazadas}.`,
  ].filter(Boolean).join('\n')
}
