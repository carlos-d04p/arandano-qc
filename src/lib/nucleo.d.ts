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

export interface FrutoLocalizado {
  /** Centro, ancho y alto relativos a la foto (0–1) */
  cx: number
  cy: number
  ancho: number
  alto: number
  /** Área respecto del objeto mayor */
  area: number
  /** Toca el borde de la foto (fruto cortado) */
  borde: boolean
}

export interface LocalizacionVarios {
  fondo: number
  fondoRGB: [number, number, number]
  frutos: FrutoLocalizado[]
  /** Objetos oscuros entre 10 % y 20 % del mayor (restos o frutos muy pequeños) que no se analizan */
  menores: number
}

declare const Nucleo: {
  localizar(img: Imagen): Localizacion | null
  localizarVarios(img: Imagen, minRel?: number): LocalizacionVarios | null
  preparar(rec: Imagen, salida?: number): Preparada | null
  LADO: number
}

export default Nucleo
