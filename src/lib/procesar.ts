// Prepara una foto igual que el dataset de entrenamiento:
//  A. localiza el fruto en una versión reducida (616 px de ancho)
//  B. recorta un cuadrado de ~2 veces el fruto y lo lleva a 1000×1000
//  C. normaliza exposición y balance de blancos (fondo → 140)
//  D. segmenta el fruto, reemplaza el fondo por gris 128 y recorta ajustado a 320×320
import type { Localizacion, LocalizacionVarios, Preparada } from './nucleo'

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
  try {
    return await procesarUno(bmp)
  } finally {
    if ('close' in bmp) bmp.close()
  }
}

type Fuente = ImageBitmap | HTMLImageElement

function reducir(bmp: Fuente): ImageData {
  const sw = 616
  const sh = Math.round((sw * bmp.height) / bmp.width)
  const xs = lienzo(sw, sh)
  xs.drawImage(bmp, 0, 0, sw, sh)
  return xs.getImageData(0, 0, sw, sh)
}

interface Recorte {
  x0: number
  y0: number
  lado: number
}

/** B. Cuadrado de ~2 veces el fruto, centrado en él y dentro de la foto. */
function cuadro(bmp: Fuente, fx: number, fy: number, tam: number): Recorte {
  const W = bmp.width, H = bmp.height
  const lado = Math.min(Math.max(2 * tam, 64), W, H)
  return { lado, x0: Math.min(Math.max(fx - lado / 2, 0), W - lado), y0: Math.min(Math.max(fy - lado / 2, 0), H - lado) }
}

async function prepararRecorte(xr: CanvasRenderingContext2D) {
  const rec = xr.getImageData(0, 0, LADO, LADO)
  const p = await pedir<Preparada | null>({ tipo: 'preparar', img: rec, salida: ENTRADA }, [rec.data.buffer])
  if (!p) throw new ErrorFoto('No se pudo separar el fruto del fondo. Revisa la luz y evita sombras fuertes.')
  return p
}

function originalDe(bmp: Fuente, r: Recorte): string {
  const xm = lienzo(240, 240)
  xm.drawImage(bmp, r.x0, r.y0, r.lado, r.lado, 0, 0, 240, 240)
  return xm.canvas.toDataURL('image/jpeg', 0.82)
}

async function procesarUno(bmp: Fuente): Promise<FotoProcesada> {
  const W = bmp.width
  const H = bmp.height

  // A. localizar
  const reducida = reducir(bmp)
  const loc = await pedir<Localizacion | null>({ tipo: 'localizar', img: reducida }, [reducida.data.buffer])
  if (!loc) throw new ErrorFoto('No se encontró el fruto. Usa un fondo gris claro y que el arándano se vea completo.')

  const tam = Math.max(loc.ancho * W, loc.alto * H)
  const tamRelativo = tam / Math.min(W, H)
  if (tamRelativo > 0.9) throw new ErrorFoto('El fruto ocupa casi toda la foto. Aléjate un poco y vuelve a intentarlo.')

  // B. recorte cuadrado a 1000×1000
  const r = cuadro(bmp, loc.cx * W, loc.cy * H, tam)
  const xr = lienzo(LADO, LADO)
  xr.drawImage(bmp, r.x0, r.y0, r.lado, r.lado, 0, 0, LADO, LADO)
  const original = originalDe(bmp, r)

  // C-D. normalizar, segmentar, fondo gris y recorte final
  const p = await prepararRecorte(xr)
  const medidas: Medidas = { tamRelativo, tamPx: tam, fondo: loc.fondo, segundo: loc.segundo, ...p.calidad }
  return { entrada: new ImageData(new Uint8ClampedArray(p.data), ENTRADA, ENTRADA), original, medidas }
}

// ---------- Fotos con varios frutos ----------

/** Posición del fruto en la foto, relativa (0–1) */
export interface Caja {
  x: number
  y: number
  w: number
  h: number
}

export interface FrutoEnFoto extends FotoProcesada {
  caja: Caja
}

export interface FrutoFallido {
  caja: Caja
  error: string
}

export type ResultadoFoto =
  | { varios: false; foto: FotoProcesada }
  | {
      varios: true
      /** Foto completa reducida, para mostrar la ubicación de cada fruto */
      vista: string
      proporcion: number
      frutos: (FrutoEnFoto | FrutoFallido)[]
      /** Objetos oscuros más pequeños que no se analizaron */
      menores: number
    }

export const MAX_FRUTOS_FOTO = 40

/**
 * Analiza una foto con uno o varios frutos. Con un solo fruto se comporta igual que procesarFoto.
 * Con varios, recorta cada uno por separado (tapando a los vecinos con el color del fondo) y lo prepara
 * exactamente como una foto individual.
 */
export async function analizarFoto(fuente: Blob): Promise<ResultadoFoto> {
  const bmp = await abrir(fuente)
  try {
    const W = bmp.width
    const H = bmp.height
    const red = reducir(bmp)
    const lv = await pedir<LocalizacionVarios | null>({ tipo: 'localizarVarios', img: red }, [red.data.buffer])
    if (!lv) throw new ErrorFoto('No se encontró el fruto. Usa un fondo gris claro y que el arándano se vea completo.')
    if (lv.frutos.length < 2) return { varios: false, foto: await procesarUno(bmp) }

    // orden de lectura: por filas (con tolerancia de medio fruto) y de izquierda a derecha
    const altoMedio = lv.frutos.reduce((a, f) => a + f.alto, 0) / lv.frutos.length
    const frutos = lv.frutos
      .slice(0, MAX_FRUTOS_FOTO)
      .sort((a, b) => Math.round(a.cy / altoMedio) - Math.round(b.cy / altoMedio) || a.cx - b.cx)

    const [fr, fg, fb] = lv.fondoRGB
    const res: (FrutoEnFoto | FrutoFallido)[] = []
    for (const f of frutos) {
      const caja: Caja = { x: f.cx - f.ancho / 2, y: f.cy - f.alto / 2, w: f.ancho, h: f.alto }
      if (f.borde) {
        res.push({ caja, error: 'El fruto está cortado por el borde de la foto.' })
        continue
      }
      const tam = Math.max(f.ancho * W, f.alto * H)
      const r = cuadro(bmp, f.cx * W, f.cy * H, tam)
      const k = LADO / r.lado
      const xr = lienzo(LADO, LADO)
      xr.drawImage(bmp, r.x0, r.y0, r.lado, r.lado, 0, 0, LADO, LADO)
      // tapar los frutos vecinos con el color del fondo, sin tocar el fruto analizado
      xr.save()
      xr.beginPath()
      xr.rect(0, 0, LADO, LADO)
      xr.ellipse((f.cx * W - r.x0) * k, (f.cy * H - r.y0) * k, (f.ancho * W * 0.56) * k, (f.alto * H * 0.56) * k, 0, 0, 2 * Math.PI)
      xr.clip('evenodd')
      xr.fillStyle = `rgb(${fr},${fg},${fb})`
      for (const o of lv.frutos) {
        if (o === f) continue
        const ox = (o.cx * W - r.x0) * k, oy = (o.cy * H - r.y0) * k
        const rx = o.ancho * W * 0.6 * k, ry = o.alto * H * 0.6 * k
        if (ox + rx < 0 || oy + ry < 0 || ox - rx > LADO || oy - ry > LADO) continue
        xr.beginPath()
        xr.ellipse(ox, oy, rx, ry, 0, 0, 2 * Math.PI)
        xr.fill()
      }
      xr.restore()
      try {
        const p = await prepararRecorte(xr)
        const medidas: Medidas = { tamRelativo: tam / Math.min(W, H), tamPx: tam, fondo: lv.fondo, segundo: 0, ...p.calidad }
        res.push({ caja, entrada: new ImageData(new Uint8ClampedArray(p.data), ENTRADA, ENTRADA), original: originalDe(bmp, r), medidas })
      } catch (e) {
        res.push({ caja, error: e instanceof Error ? e.message : String(e) })
      }
    }

    const vw = Math.min(960, W)
    const xv = lienzo(vw, Math.round((vw * H) / W))
    xv.drawImage(bmp, 0, 0, xv.canvas.width, xv.canvas.height)
    return { varios: true, vista: xv.canvas.toDataURL('image/jpeg', 0.8), proporcion: W / H, frutos: res, menores: lv.menores }
  } finally {
    if ('close' in bmp) bmp.close()
  }
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
