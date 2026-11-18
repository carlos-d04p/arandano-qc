// Prepara una foto igual que el dataset de entrenamiento:
//  A. localiza el fruto en una versión reducida (616 px de ancho)
//  B. recorta un cuadrado de ~2 veces el fruto y lo lleva a 1000×1000
//  C. normaliza exposición y balance de blancos (fondo → 140)
//  D. segmenta el fruto, reemplaza el fondo por gris 128 y recorta ajustado a 320×320
import type { Localizacion, Preparada } from './nucleo'

export const ENTRADA = 320
const LADO = 1000

let worker: Worker | null = null
let sigId = 1
const pendientes = new Map<number, { ok: (v: unknown) => void; mal: (e: Error) => void }>()

function obtenerWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./preproceso.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (ev) => {
    const { id, ok, res, error } = ev.data
    const p = pendientes.get(id)
    if (!p) return
    pendientes.delete(id)
    if (ok) p.ok(res)
    else p.mal(new Error(error))
  }
  worker.onerror = (ev) => {
    for (const p of pendientes.values()) p.mal(new Error(ev.message || 'Error en el procesamiento'))
    pendientes.clear()
    worker = null
  }
  return worker
}

function pedir<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const id = sigId++
  return new Promise<T>((ok, mal) => {
    pendientes.set(id, { ok: ok as (v: unknown) => void, mal })
    obtenerWorker().postMessage({ ...msg, id }, transfer)
  })
}

async function abrir(fuente: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(fuente, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(fuente)
    try {
      const im = new Image()
      im.src = url
      await im.decode()
      return im
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

export class ErrorFoto extends Error {}

export interface Medidas {
  /** Fracción del lado menor de la foto que ocupa el fruto */
  tamRelativo: number
  /** Tamaño del fruto en píxeles de la foto original */
  tamPx: number
  /** Gris mediano de la foto (exposición del fondo) */
  fondo: number
  /** Área del segundo objeto oscuro respecto del fruto */
  segundo: number
  /** Indicadores medidos durante la segmentación (ver nucleo.js, paso E) */
  bordeNitidez: number
  color: [number, number, number]
  brilloFruto: number
  solidez: number
  aspecto: number
  fondoDE: number
  nitidez: number
  anisotropia: number
}

export interface FotoProcesada {
  /** Imagen 320×320 exactamente como la recibe el modelo */
  entrada: ImageData
  /** Miniatura de la foto original (dataURL) */
  original: string
  /** Medidas para el control de calidad de la foto */
  medidas: Medidas
}

export async function procesarFoto(fuente: Blob): Promise<FotoProcesada> {
  const bmp = await abrir(fuente)
  const W = bmp.width
  const H = bmp.height

  // A. localizar
  const sw = 616
  const sh = Math.round((sw * H) / W)
  const xs = lienzo(sw, sh)
  xs.drawImage(bmp, 0, 0, sw, sh)
  const reducida = xs.getImageData(0, 0, sw, sh)
  const loc = await pedir<Localizacion | null>({ tipo: 'localizar', img: reducida }, [reducida.data.buffer])
  if (!loc) throw new ErrorFoto('No se encontró el fruto. Usa un fondo gris claro y que el arándano se vea completo.')

  const fx = loc.cx * W
  const fy = loc.cy * H
  const tam = Math.max(loc.ancho * W, loc.alto * H)
  const tamRelativo = tam / Math.min(W, H)
  if (tamRelativo > 0.9) throw new ErrorFoto('El fruto ocupa casi toda la foto. Aléjate un poco y vuelve a intentarlo.')

  // B. recorte cuadrado a 1000×1000
  const lado = Math.min(Math.max(2 * tam, 64), W, H)
  const x0 = Math.min(Math.max(fx - lado / 2, 0), W - lado)
  const y0 = Math.min(Math.max(fy - lado / 2, 0), H - lado)
  const xr = lienzo(LADO, LADO)
  xr.drawImage(bmp, x0, y0, lado, lado, 0, 0, LADO, LADO)

  const xm = lienzo(240, 240)
  xm.drawImage(bmp, x0, y0, lado, lado, 0, 0, 240, 240)
  const original = xm.canvas.toDataURL('image/jpeg', 0.82)
  if ('close' in bmp) bmp.close()

  // C-D. normalizar, segmentar, fondo gris y recorte final
  const rec = xr.getImageData(0, 0, LADO, LADO)
  const p = await pedir<Preparada | null>({ tipo: 'preparar', img: rec, salida: ENTRADA }, [rec.data.buffer])
  if (!p) throw new ErrorFoto('No se pudo separar el fruto del fondo. Revisa la luz y evita sombras fuertes.')

  const medidas: Medidas = { tamRelativo, tamPx: tam, fondo: loc.fondo, segundo: loc.segundo, ...p.calidad }
  return { entrada: new ImageData(new Uint8ClampedArray(p.data), ENTRADA, ENTRADA), original, medidas }
}

/** Miniatura JPEG pequeña de una imagen ya preprocesada (para guardar en el dispositivo). */
export function miniaturaDe(img: ImageData, lado = 72): string {
  const c = lienzo(img.width, img.height)
  c.putImageData(img, 0, 0)
  const m = lienzo(lado, lado)
  m.drawImage(c.canvas, 0, 0, lado, lado)
  return m.canvas.toDataURL('image/jpeg', 0.72)
}

export function aDataURL(img: ImageData, calidad = 0.85): string {
  const c = lienzo(img.width, img.height)
  c.putImageData(img, 0, 0)
  return c.canvas.toDataURL('image/jpeg', calidad)
}
