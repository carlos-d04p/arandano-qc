// Registro del lote evaluado. Se guarda en el propio dispositivo (localStorage), nunca en un servidor.
import { useCallback, useEffect, useState } from 'react'
import { veredicto, type Clase } from './veredicto'
import { DEFECTOS, type CodigoDefecto } from './defectos'
import type { CodigoAviso } from './calidad'
import { wilson } from './validacion'

export interface FrutoGuardado {
  n: number
  fecha: string
  vistas: number
  p: number
  clase: Clase
  miniatura: string
  /** Otros defectos de la inspección complementaria (experimental) */
  defectos?: CodigoDefecto[]
  /** Advertencias de calidad de la foto */
  avisos?: CodigoAviso[]
}

export interface Extra {
  defectos: CodigoDefecto[]
  avisos: CodigoAviso[]
}

const CLAVE = 'arandanos-qc:lote:v1'
const CLAVE_DATOS = 'arandanos-qc:lote-datos:v1'

function leerJSON<T>(clave: string, defecto: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(clave) || 'null')
    return v ?? defecto
  } catch {
    return defecto
  }
}

function guardarJSON(clave: string, v: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(v))
  } catch {
    /* sin almacenamiento (modo privado): los datos viven solo en esta sesión */
  }
}

export function useLote() {
  const [lote, setLote] = useState<FrutoGuardado[]>(() => {
    const v = leerJSON<unknown>(CLAVE, [])
    return Array.isArray(v) ? (v as FrutoGuardado[]) : []
  })

  useEffect(() => guardarJSON(CLAVE, lote), [lote])

  const siguiente = lote.length ? Math.max(...lote.map((f) => f.n)) + 1 : 1

  const agregar = useCallback((p: number, vistas: number, miniatura: string, extra?: Extra) => {
    setLote((l) => {
      const n = l.length ? Math.max(...l.map((f) => f.n)) + 1 : 1
      const v = veredicto(p)!
      return [...l, { n, fecha: new Date().toISOString(), vistas, p, clase: v.clase, miniatura, defectos: extra?.defectos, avisos: extra?.avisos }]
    })
  }, [])

  const quitar = useCallback((n: number) => setLote((l) => l.filter((f) => f.n !== n)), [])
  const vaciar = useCallback(() => setLote([]), [])

  return { lote, siguiente, agregar, quitar, vaciar }
}

// ---------- Datos del lote y criterio de aceptación ----------

export interface DatosLote {
  codigo: string
  productor: string
  variedad: string
  fecha: string
  responsable: string
  notas: string
  /** Porcentaje máximo de frutos defectuosos para aceptar el lote */
  tolerancia: number
  /** Número mínimo de frutos para emitir un dictamen */
  minimo: number
  /** Cómo se tratan los resultados dudosos */
  dudosos: 'defectuoso' | 'excluir'
  /** Si los frutos con otros defectos (experimental) cuentan como defectuosos */
  contarOtros: boolean
}

export const DATOS_INICIALES: DatosLote = {
  codigo: '',
  productor: '',
  variedad: '',
  fecha: '',
  responsable: '',
  notas: '',
  tolerancia: 5,
  minimo: 30,
  dudosos: 'defectuoso',
  contarOtros: false,
}

export function useDatosLote() {
  const [datos, setDatos] = useState<DatosLote>(() => ({ ...DATOS_INICIALES, ...leerJSON<Partial<DatosLote>>(CLAVE_DATOS, {}) }))
  useEffect(() => guardarJSON(CLAVE_DATOS, datos), [datos])
  const cambiar = useCallback(<K extends keyof DatosLote>(k: K, v: DatosLote[K]) => setDatos((d) => ({ ...d, [k]: v })), [])
  /** Para un lote nuevo: borra la identificación del lote y conserva productor, responsable y criterio. */
  const nuevoLote = useCallback(() => setDatos((d) => ({ ...d, codigo: '', variedad: '', fecha: '', notas: '' })), [])
  return { datos, cambiar, nuevoLote }
}

export function resumen(lote: FrutoGuardado[]) {
  const total = lote.length
  const ok = lote.filter((f) => f.clase === 'ok').length
  const mal = lote.filter((f) => f.clase === 'mal').length
  const duda = total - ok - mal
  const otros = lote.filter((f) => f.defectos?.length).length
  return { total, ok, mal, duda, otros, pctMal: total ? mal / total : 0 }
}

export type EstadoDictamen = 'vacio' | 'insuficiente' | 'aceptado' | 'rechazado'

export interface Dictamen {
  estado: EstadoDictamen
  /** Frutos que entran al cálculo */
  n: number
  defectuosos: number
  tasa: number | null
  ic: [number, number] | null
  /** El límite superior del IC95 supera la tolerancia aunque la tasa no lo haga */
  limite: boolean
}

/** Es defectuoso según el criterio: no cumple, dudoso (si así se definió) u otros defectos (si se marcaron). */
export function esDefectuoso(f: FrutoGuardado, d: DatosLote): boolean {
  if (f.clase === 'mal') return true
  if (f.clase === 'duda' && d.dudosos === 'defectuoso') return true
  return d.contarOtros && !!f.defectos?.length
}

export function dictamen(lote: FrutoGuardado[], d: DatosLote): Dictamen {
  const usados = lote.filter((f) => !(f.clase === 'duda' && d.dudosos === 'excluir' && !(d.contarOtros && f.defectos?.length)))
  const n = usados.length
  const defectuosos = usados.filter((f) => esDefectuoso(f, d)).length
  const tasa = n ? defectuosos / n : null
  const ic = wilson(defectuosos, n)
  const tol = d.tolerancia / 100
  let estado: EstadoDictamen = 'vacio'
  if (lote.length) estado = lote.length < d.minimo ? 'insuficiente' : tasa! <= tol ? 'aceptado' : 'rechazado'
  return { estado, n, defectuosos, tasa, ic, limite: !!ic && tasa! <= tol && ic[1] > tol }
}

export const nombresDefectos = (cs?: CodigoDefecto[]) => (cs ?? []).map((c) => DEFECTOS[c].titulo).join(', ')

const limpiar = (s: string) => s.replace(/[;\n\r]+/g, ' ').trim()

export function aCSV(lote: FrutoGuardado[], d: DatosLote): string {
  const filas = lote.map((f) =>
    [
      limpiar(d.codigo),
      f.n,
      new Date(f.fecha).toLocaleString('es'),
      f.vistas,
      f.p.toFixed(4),
      veredicto(f.p)!.corto,
      f.defectos?.length ? f.defectos.join('|') : 'ninguno',
      f.avisos?.length ? f.avisos.join('|') : 'ok',
      esDefectuoso(f, d) ? 1 : 0,
    ].join(';'),
  )
  return ['lote;fruto;fecha;vistas;p_deshidratado;resultado;otros_defectos;calidad_foto;defectuoso', ...filas].join('\n')
}

export function descargar(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
