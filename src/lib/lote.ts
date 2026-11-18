// Registro del lote evaluado. Se guarda en el propio dispositivo (localStorage), nunca en un servidor.
import { useCallback, useEffect, useState } from 'react'
import { veredicto, type Clase } from './veredicto'

export interface FrutoGuardado {
  n: number
  fecha: string
  vistas: number
  p: number
  clase: Clase
  miniatura: string
}

const CLAVE = 'arandanos-qc:lote:v1'

function leer(): FrutoGuardado[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function useLote() {
  const [lote, setLote] = useState<FrutoGuardado[]>(leer)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lote))
    } catch {
      /* sin almacenamiento (modo privado): el lote vive solo en esta sesión */
    }
  }, [lote])

  const siguiente = lote.length ? Math.max(...lote.map((f) => f.n)) + 1 : 1

  const agregar = useCallback((p: number, vistas: number, miniatura: string) => {
    setLote((l) => {
      const n = l.length ? Math.max(...l.map((f) => f.n)) + 1 : 1
      const v = veredicto(p)!
      return [...l, { n, fecha: new Date().toISOString(), vistas, p, clase: v.clase, miniatura }]
    })
  }, [])

  const quitar = useCallback((n: number) => setLote((l) => l.filter((f) => f.n !== n)), [])
  const vaciar = useCallback(() => setLote([]), [])

  return { lote, siguiente, agregar, quitar, vaciar }
}

export function resumen(lote: FrutoGuardado[]) {
  const total = lote.length
  const ok = lote.filter((f) => f.clase === 'ok').length
  const mal = lote.filter((f) => f.clase === 'mal').length
  const duda = total - ok - mal
  return { total, ok, mal, duda, pctMal: total ? mal / total : 0 }
}

export function aCSV(lote: FrutoGuardado[]): string {
  const filas = lote.map((f) =>
    [f.n, new Date(f.fecha).toLocaleString('es'), f.vistas, f.p.toFixed(4), veredicto(f.p)!.corto].join(';'),
  )
  return ['fruto;fecha;vistas;p_deshidratado;calidad', ...filas].join('\n')
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
