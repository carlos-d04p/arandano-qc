// Tipos del núcleo de preprocesamiento (nucleo.js replica el pipeline de Python del dataset).
export interface Imagen {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

export interface Localizacion {
  cx: number
  cy: number
  ancho: number
  alto: number
  fondo: number
  segundo: number
}

export interface Preparada {
  data: Uint8ClampedArray
  width: number
  height: number
  fondo: number
  areaFruto: number
  calidad: {
    bordeNitidez: number
    color: [number, number, number]
    brilloFruto: number
    solidez: number
    aspecto: number
    fondoDE: number
    nitidez: number
    anisotropia: number
  }
}

declare const Nucleo: {
  localizar(img: Imagen): Localizacion | null
  preparar(rec: Imagen, salida?: number): Preparada | null
  LADO: number
}

export default Nucleo
