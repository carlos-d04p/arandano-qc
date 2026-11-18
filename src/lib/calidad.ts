// Control de calidad de la foto antes de confiar en la clasificación.
// Umbrales calibrados con 180 fotos válidas del dataset (percentiles 2–98 %), las fotos excluidas
// por movimiento y degradaciones simuladas (desenfoque, sub/sobreexposición, fruto pequeño, dos frutos, forma alargada).
import type { Medidas } from './procesar'

export type CodigoAviso = 'desenfoque' | 'pequeno' | 'oscura' | 'sobreexpuesta' | 'fondo' | 'color' | 'objeto_cercano'

export interface Aviso {
  codigo: CodigoAviso
  texto: string
}

export const UMBRALES = {
  /** Bloqueo: segundo objeto oscuro con área ≥ 40 % del fruto (dataset: máx. 25 %) */
  segundoBloqueo: 0.4,
  /** Advertencia: segundo objeto entre 25 % y 40 % */
  segundoAviso: 0.25,
  /** Bloqueo: relación ancho/alto < 0,5 (dataset: mín. 0,58) */
  aspectoMin: 0.5,
  /** Bloqueo: área / envolvente convexa < 0,55 (dataset: mín. 0,68) */
  solidezMin: 0.55,
  /** Advertencia: definición del contorno < 0,036 (dataset: p2 = 0,040; desenfoque fuerte ≤ 0,030) */
  bordeMin: 0.036,
  /** Advertencia: fruto < 15 % del lado menor o < 220 px */
  tamRelMin: 0.15,
  tamPxMin: 220,
  /** Advertencia: gris mediano de la foto fuera de 70–225 (dataset: 85–142) */
  fondoMin: 70,
  fondoMax: 225,
  /** Advertencia: desviación del gris del fondo > 28 (dataset: máx. 20) */
  fondoDEMax: 28,
  /** Advertencia: saturación del color del fruto > 0,70 (dataset: máx. 0,66) */
  saturacionMax: 0.7,
}

export class FotoNoValida extends Error {}

/** Lanza FotoNoValida si la foto no debe clasificarse; si no, devuelve las advertencias. */
export function evaluarCalidad(m: Medidas): Aviso[] {
  const U = UMBRALES
  if (m.segundo >= U.segundoBloqueo)
    throw new FotoNoValida('Hay más de un fruto u objeto oscuro en la foto. Deja solo un arándano sobre la cartulina.')
  if (m.aspecto < U.aspectoMin)
    throw new FotoNoValida('El objeto detectado es demasiado alargado para ser un arándano. Revisa que no haya sombras u objetos junto al fruto.')
  if (m.solidez < U.solidezMin)
    throw new FotoNoValida('La forma detectada es irregular. Puede haber una sombra fuerte u otro objeto pegado al fruto.')

  const avisos: Aviso[] = []
  if (m.bordeNitidez < U.bordeMin)
    avisos.push({ codigo: 'desenfoque', texto: 'La foto parece desenfocada o movida. Mantén el celular quieto y espera a que enfoque.' })
  if (m.tamRelativo < U.tamRelMin || m.tamPx < U.tamPxMin)
    avisos.push({ codigo: 'pequeno', texto: 'El fruto se ve muy pequeño. Acércate hasta que ocupe entre 1/5 y 1/3 del ancho de la foto.' })
  if (m.fondo < U.fondoMin)
    avisos.push({ codigo: 'oscura', texto: 'La foto está oscura. Busca más luz, sin usar flash.' })
  if (m.fondo > U.fondoMax)
    avisos.push({ codigo: 'sobreexpuesta', texto: 'La foto está sobreexpuesta o el fondo es demasiado claro. Usa una cartulina gris y evita la luz directa.' })
  if (m.fondoDE > U.fondoDEMax)
    avisos.push({ codigo: 'fondo', texto: 'El fondo tiene manchas, textura u otros objetos. Usa una cartulina gris lisa y limpia.' })
  const mx = Math.max(...m.color)
  if (mx > 0 && (mx - Math.min(...m.color)) / mx > U.saturacionMax)
    avisos.push({ codigo: 'color', texto: 'El color del objeto es poco habitual para un arándano.' })
  if (m.segundo >= U.segundoAviso)
    avisos.push({ codigo: 'objeto_cercano', texto: 'Hay otra mancha u objeto oscuro cerca del fruto (por ejemplo, una sombra).' })
  return avisos
}
