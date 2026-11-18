// Carga el clasificador YOLOv11n-cls exportado a ONNX (public/modelo/best.onnx) y lo ejecuta en el navegador.
import type { InferenceSession } from 'onnxruntime-web'
import { ENTRADA } from './procesar'

const RUTA_MODELO = `${import.meta.env.BASE_URL}modelo/best.onnx`
/** Orden de clases del modelo (metadata de Ultralytics): {0: 'deshidratado', 1: 'sano'} */
export const CLASES = ['deshidratado', 'sano'] as const
const I_DESH = 0

type Ort = typeof import('onnxruntime-web')
let ort: Ort | null = null
let sesion: Promise<InferenceSession> | null = null

export function cargarModelo(): Promise<InferenceSession> {
  if (sesion) return sesion
  sesion = (async () => {
    ort = await import('onnxruntime-web/wasm')
    ort.env.wasm.numThreads = 1
    const s = await ort.InferenceSession.create(RUTA_MODELO, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
    // calentamiento: la primera inferencia es la más lenta
    const x = new ort.Tensor('float32', new Float32Array(3 * ENTRADA * ENTRADA).fill(0.5), [1, 3, ENTRADA, ENTRADA])
    await s.run({ [s.inputNames[0]]: x })
    return s
  })()
  sesion.catch(() => {
    sesion = null
  })
  return sesion
}

/** Devuelve P(deshidratado) para una imagen 320×320 ya preprocesada. */
export async function clasificar(img: ImageData): Promise<number> {
  const s = await cargarModelo()
  const n = ENTRADA * ENTRADA
  const t = new Float32Array(3 * n)
  const d = img.data
  // RGBA (HWC, 0..255) → RGB planar (CHW, 0..1), igual que Ultralytics
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    t[i] = d[j] / 255
    t[n + i] = d[j + 1] / 255
    t[2 * n + i] = d[j + 2] / 255
  }
  const x = new ort!.Tensor('float32', t, [1, 3, ENTRADA, ENTRADA])
  const y = await s.run({ [s.inputNames[0]]: x })
  let v = Array.from(y[s.outputNames[0]].data as Float32Array)
  const suma = v.reduce((a, b) => a + b, 0)
  if (Math.abs(suma - 1) > 0.02 || v.some((z) => z < 0)) {
    const m = Math.max(...v)
    const e = v.map((z) => Math.exp(z - m))
    const te = e.reduce((a, b) => a + b, 0)
    v = e.map((z) => z / te)
  }
  return v[I_DESH]
}
