/// <reference lib="webworker" />
// Corre el preprocesamiento pesado fuera del hilo principal para que la interfaz no se congele en el celular.
import Nucleo from './nucleo.js'

export type Pedido =
  | { id: number; tipo: 'localizar'; img: ImageData }
  | { id: number; tipo: 'preparar'; img: ImageData; salida: number }

self.onmessage = (ev: MessageEvent<Pedido>) => {
  const p = ev.data
  try {
    if (p.tipo === 'localizar') {
      self.postMessage({ id: p.id, ok: true, res: Nucleo.localizar(p.img) })
    } else {
      const r = Nucleo.preparar(p.img, p.salida)
      if (r) (self as unknown as Worker).postMessage({ id: p.id, ok: true, res: r }, [r.data.buffer])
      else self.postMessage({ id: p.id, ok: true, res: null })
    }
  } catch (e) {
    self.postMessage({ id: p.id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
