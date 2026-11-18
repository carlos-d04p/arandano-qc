// Inspección complementaria (experimental): busca otros defectos que el modelo no fue entrenado a reconocer.
// Trabaja sobre la imagen 320×320 ya preprocesada (fondo gris 128) y no usa el modelo.
// Calibración (17-nov-2026): 1573 fotos del dataset y 30 fotos de celular de frutos deshidratados.
//  · Contorno irregular: 3 de 740 sanos (0,4 %), 180 de 833 deshidratados, 11 de 30 fotos de celular.
//  · Zonas rojizas: 0 de 740 sanos (máximo 0,14 %), 98 de 833 deshidratados, 6 de 30 fotos de celular.
//  · Grieta: 0 de 740 sanos (máximo 0,30, cáliz de la corona ≤ 0,26), 1 de 833 deshidratados.
//  · Mancha café: 2 de 740 sanos (ambos con heridas visibles), 3 de 833 deshidratados.

export type CodigoDefecto = 'contorno' | 'exudado' | 'grieta' | 'mancha'

export interface Defecto {
  codigo: CodigoDefecto
  titulo: string
  texto: string
}

export interface RasgosDefecto {
  /** Área / envolvente convexa del contorno (1 = sin entrantes) */
  solidez: number
  /** Fracción del fruto con tonos rojo-morados (pulpa expuesta o jugo) */
  rojizo: number
  /** Longitud de la mayor zona café-anaranjada respecto del diámetro del fruto */
  grieta: number
  /** Fracción del fruto con tono café-anaranjado */
  cafe: number
}

export const UMBRALES_DEFECTO = {
  /** Sanos del dataset: p1 = 0,978 (los casos bajo el umbral tienen el pedicelo adherido) */
  solidezMin: 0.978,
  /** Sanos del dataset: máximo 0,0014; la cicatriz anaranjada del pedúnculo no cuenta */
  rojizoMax: 0.005,
  /** Zona café-anaranjada alargada más larga que el 32 % del diámetro (cáliz y cicatriz: ≤ 0,30) */
  grietaMax: 0.32,
  /** Más del 4 % de la piel café-anaranjada (sanos: p99 = 2,5 %) */
  cafeMax: 0.04,
}

export const DEFECTOS: Record<CodigoDefecto, Omit<Defecto, 'codigo'>> = {
  contorno: {
    titulo: 'Contorno irregular',
    texto: 'El borde del fruto tiene entrantes: posible abolladura, deformación, arrugas profundas o pedicelo adherido.',
  },
  exudado: {
    titulo: 'Zonas rojizas',
    texto: 'Hay zonas rojo-moradas en la piel: posible herida, rajadura, pulpa expuesta o jugo (exudado).',
  },
  grieta: {
    titulo: 'Grieta o rajadura',
    texto: 'Hay una línea café que se extiende por la piel: posible rajadura, partidura o daño mecánico.',
  },
  mancha: {
    titulo: 'Mancha café',
    texto: 'Una parte grande de la piel es café: posible herida seca, pudrición, golpe o quemadura de sol.',
  },
}

function erosionar(m: Uint8Array, w: number, h: number, veces: number): Uint8Array {
  let a = m
  for (let t = 0; t < veces; t++) {
    const b = new Uint8Array(w * h)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        b[i] = a[i] && a[i - 1] && a[i + 1] && a[i - w] && a[i + w] ? 1 : 0
      }
    a = b
  }
  return a
}

/** Máscara del fruto: lo que no está conectado al borde con el gris de fondo (128); se queda con la mayor componente. */
export function mascaraFruto(img: ImageData): Uint8Array {
  const { width: w, height: h, data: d } = img
  const N = w * h
  const fondo = new Uint8Array(N)
  const esGris = (i: number) =>
    Math.abs(d[4 * i] - 128) <= 12 && Math.abs(d[4 * i + 1] - 128) <= 12 && Math.abs(d[4 * i + 2] - 128) <= 12
  const pila: number[] = []
  for (let x = 0; x < w; x++) pila.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) pila.push(y * w, y * w + w - 1)
  while (pila.length) {
    const i = pila.pop()!
    if (fondo[i] || !esGris(i)) continue
    fondo[i] = 1
    const x = i % w
    if (x > 0) pila.push(i - 1)
    if (x < w - 1) pila.push(i + 1)
    if (i >= w) pila.push(i - w)
    if (i < N - w) pila.push(i + w)
  }
  const etq = new Int32Array(N)
  let mejor = 0, mejorN = 0, sig = 1
  for (let i = 0; i < N; i++) {
    if (fondo[i] || etq[i]) continue
    let n = 0
    const q = [i]
    etq[i] = sig
    while (q.length) {
      const j = q.pop()!
      n++
      const x = j % w
      const vec = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]
      for (const k of vec) {
        if (k >= 0 && k < N && !fondo[k] && !etq[k]) {
          etq[k] = sig
          q.push(k)
        }
      }
    }
    if (n > mejorN) {
      mejorN = n
      mejor = sig
    }
    sig++
  }
  const m = new Uint8Array(N)
  for (let i = 0; i < N; i++) m[i] = etq[i] === mejor ? 1 : 0
  return m
}

function areaCasco(pts: [number, number][]): { area: number; perimetro: number } {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cruz = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const inf: [number, number][] = []
  for (const p of pts) {
    while (inf.length >= 2 && cruz(inf[inf.length - 2], inf[inf.length - 1], p) <= 0) inf.pop()
    inf.push(p)
  }
  const sup: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (sup.length >= 2 && cruz(sup[sup.length - 2], sup[sup.length - 1], p) <= 0) sup.pop()
    sup.push(p)
  }
  const casco = inf.slice(0, -1).concat(sup.slice(0, -1))
  let a = 0, per = 0
  for (let i = 0; i < casco.length; i++) {
    const [x1, y1] = casco[i]
    const [x2, y2] = casco[(i + 1) % casco.length]
    a += x1 * y2 - x2 * y1
    per += Math.hypot(x2 - x1, y2 - y1)
  }
  return { area: Math.abs(a) / 2, perimetro: per }
}

export function medirDefectos(img: ImageData): RasgosDefecto | null {
  const { width: w, height: h, data: d } = img
  const m = mascaraFruto(img)
  let n = 0
  const pts: [number, number][] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!m[i]) continue
      n++
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) pts.push([x, y])
    }
  if (n < 500) return null
  const casco = areaCasco(pts)
  // el casco pasa por los centros de los píxeles del borde: se suma medio píxel de perímetro
  const solidez = Math.min(1, n / (casco.area + casco.perimetro / 2 + 1))

  // color en el interior (sin el borde, donde se mezcla con el fondo)
  const interior = erosionar(m, w, h, 6)
  let k = 0, rojo = 0
  for (let i = 0; i < w * h; i++) {
    if (!interior[i]) continue
    k++
    const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2]
    // rojo-morado (pulpa, jugo); excluye el anaranjado de la cicatriz del pedúnculo (g > b)
    if (r > 60 && r > g + 30 && r > b + 15 && b >= g - 5) rojo++
  }
  return { solidez, rojizo: k ? rojo / k : 0, ...medirCafe(d, w, h, erosionar(m, w, h, 3), n) }
}

/**
 * Grietas o rajaduras: zonas café-anaranjadas (pulpa expuesta y seca) con forma de línea larga.
 * La cicatriz del pedúnculo tiene el mismo color pero es compacta, por eso se mide la longitud
 * de cada zona (eje mayor) respecto del diámetro del fruto.
 */
function medirCafe(d: Uint8ClampedArray, w: number, h: number, interior: Uint8Array, areaFruto: number): { grieta: number; cafe: number } {
  const N = w * h
  const tan = new Uint8Array(N)
  let nI = 0, nT = 0
  for (let i = 0; i < N; i++) {
    if (!interior[i]) continue
    nI++
    const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2]
    if (r >= 70 && r - b >= 25 && g - b >= 8) {
      tan[i] = 1
      nT++
    }
  }
  const diam = 2 * Math.sqrt(areaFruto / Math.PI)
  const visto = new Uint8Array(N)
  let mejor = 0
  for (let s = 0; s < N; s++) {
    if (!tan[s] || visto[s]) continue
    const pila = [s]
    visto[s] = 1
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
    while (pila.length) {
      const p = pila.pop()!
      const x = p % w, y = (p / w) | 0
      n++
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const q = yy * w + xx
          if (tan[q] && !visto[q]) {
            visto[q] = 1
            pila.push(q)
          }
        }
    }
    if (n < 6) continue
    const mx = sx / n, my = sy / n
    const vxx = sxx / n - mx * mx, vyy = syy / n - my * my, vxy = sxy / n - mx * my
    const tr = vxx + vyy, det = vxx * vyy - vxy * vxy
    const lmax = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    // una línea de longitud L tiene varianza L²/12 a lo largo de su eje
    const largo = Math.sqrt(12 * lmax)
    mejor = Math.max(mejor, largo / diam)
  }
  return { grieta: mejor, cafe: nI ? nT / nI : 0 }
}

export function evaluarDefectos(r: RasgosDefecto | null): Defecto[] {
  if (!r) return []
  const out: Defecto[] = []
  if (r.solidez < UMBRALES_DEFECTO.solidezMin) out.push({ codigo: 'contorno', ...DEFECTOS.contorno })
  if (r.rojizo > UMBRALES_DEFECTO.rojizoMax) out.push({ codigo: 'exudado', ...DEFECTOS.exudado })
  if (r.grieta > UMBRALES_DEFECTO.grietaMax) out.push({ codigo: 'grieta', ...DEFECTOS.grieta })
  if (r.cafe > UMBRALES_DEFECTO.cafeMax) out.push({ codigo: 'mancha', ...DEFECTOS.mancha })
  return out
}

export function inspeccionar(img: ImageData): CodigoDefecto[] {
  return evaluarDefectos(medirDefectos(img)).map((x) => x.codigo)
}
