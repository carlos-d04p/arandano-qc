// nucleo.js — Preprocesamiento de la app (replica procesar.py + armar_dataset.py + segmentar.py)
// Trabaja sobre arreglos RGBA (como ImageData) para poder probarse fuera del navegador.
const Nucleo = (() => {
  const GRIS = 128, FONDO_OBJ = 140, LADO = 1000;

  function gris(d, n) {               // igual que cv2.COLOR_RGB2GRAY
    const g = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  }
  function mediana(vals) {            // valores 0..255
    const h = new Uint32Array(256); let n = 0;
    for (const v of vals) { h[Math.max(0, Math.min(255, Math.round(v)))]++; n++; }
    let acc = 0; const mitad = n / 2;
    for (let i = 0; i < 256; i++) { acc += h[i]; if (acc >= mitad) return i; }
    return 255;
  }
  function bordes(w, h, b) {          // indices de las franjas de borde (ancho b)
    const idx = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (y < b || y >= h - b || x < b || x >= w - b) idx.push(y * w + x);
    return idx;
  }
  function cajaH(src, dst, w, h, r) {
    for (let y = 0; y < h; y++) {
      let s = 0; const o = y * w;
      for (let x = -r; x <= r; x++) s += src[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        dst[o + x] = s / (2 * r + 1);
        s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
  }
  function cajaV(src, dst, w, h, r) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += src[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = s / (2 * r + 1);
        s += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
      }
    }
  }
  function desenfoque(a, w, h, r, pasadas = 3) {   // aproxima un gaussiano con cajas
    let src = Float32Array.from(a); const tmp = new Float32Array(a.length);
    for (let p = 0; p < pasadas; p++) { cajaH(src, tmp, w, h, r); cajaV(tmp, src, w, h, r); }
    return src;
  }
  function morf(m, w, h, r, erosion) {             // erosion / dilatacion cuadrada (separable)
    const t = new Uint8Array(m.length), o = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = erosion ? 1 : 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; const q = (xx < 0 || xx >= w) ? 0 : m[y * w + xx]; if (erosion ? !q : q) { v = erosion ? 0 : 1; break; } }
      t[y * w + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = erosion ? 1 : 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; const q = (yy < 0 || yy >= h) ? 0 : t[yy * w + x]; if (erosion ? !q : q) { v = erosion ? 0 : 1; break; } }
      o[y * w + x] = v;
    }
    return o;
  }
  function mayorComponente(m, w, h) {
    const lab = new Int32Array(m.length), cola = new Int32Array(m.length);
    let mejor = null, id = 0;
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || lab[s]) continue;
      id++; let ini = 0, fin = 0; cola[fin++] = s; lab[s] = id;
      let n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      while (ini < fin) {
        const p = cola[ini++], x = p % w, y = (p / w) | 0;
        n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const vec = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of vec) if (q >= 0 && m[q] && !lab[q]) { lab[q] = id; cola[fin++] = q; }
      }
      if (!mejor || n > mejor.n) mejor = { id, n, cx: sx / n, cy: sy / n, x0, y0, x1, y1 };
    }
    if (!mejor) return null;
    mejor.lab = lab; return mejor;
  }
  function envolvente(pts) {                      // casco convexo (monotone chain)
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function rellenarPoligono(poly, w, h) {         // relleno por filas (regla par-impar)
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = a; x <= b; x++) m[y * w + x] = 1;
      }
    }
    return m;
  }

  // Paso A: localizar el fruto en la foto reducida (como procesar.analizar, a 1/8 de 4928 px)
  function localizar(img) {
    const { data, width: w, height: h } = img, n = w * h;
    const g = gris(data, n), fondo = mediana(g);
    let m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = g[i] < 0.45 * fondo ? 1 : 0;
    m = morf(morf(m, w, h, 1, true), w, h, 1, false);
    const c = mayorComponente(m, w, h);
    if (!c || c.n < 30) return null;
    return { cx: c.cx / w, cy: c.cy / h, ancho: (c.x1 - c.x0 + 1) / w, alto: (c.y1 - c.y0 + 1) / h, fondo };
  }

  // Pasos B-D: sobre el recorte 1000x1000 (como armar_dataset.py + segmentar.py)
  function preparar(rec, salida = 320) {
    const { data, width: w, height: h } = rec, n = w * h;
    // B. normalizar exposicion / balance: mediana por canal de franjas de 60 px -> 140
    const bi = bordes(w, h, Math.round(60 * w / LADO));
    const esc = [0, 1, 2].map(c => FONDO_OBJ / Math.max(1, mediana(bi.map(i => data[4 * i + c]))));
    const nd = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) nd[3 * i + c] = Math.min(255, Math.floor(data[4 * i + c] * esc[c]));
    // C. mascara: gris desenfocado < 0.40 x fondo, apertura 7x7, mayor componente, envolvente convexa, dilatar
    const g0 = new Float32Array(n);
    for (let i = 0; i < n; i++) g0[i] = 0.299 * nd[3 * i] + 0.587 * nd[3 * i + 1] + 0.114 * nd[3 * i + 2];
    const g = desenfoque(g0, w, h, 1, 3);
    const bg = mediana(bordes(w, h, Math.round(80 * w / LADO)).map(i => g[i]));
    let m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = g[i] < 0.40 * bg ? 1 : 0;
    const r7 = Math.max(1, Math.round(3 * w / LADO));
    m = morf(morf(m, w, h, r7, true), w, h, r7, false);
    const c = mayorComponente(m, w, h);
    if (!c || c.n < 200) return null;
    const pts = [];
    for (let y = c.y0; y <= c.y1; y++) {           // extremos por fila bastan para el casco
      let a = -1, b = -1;
      for (let x = c.x0; x <= c.x1; x++) if (c.lab[y * w + x] === c.id) { if (a < 0) a = x; b = x; }
      if (a >= 0) { pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1]); }
    }
    let mh = rellenarPoligono(envolvente(pts), w, h);
    mh = morf(mh, w, h, Math.max(1, Math.round(2 * w / LADO)), false);
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mh[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const alfa = desenfoque(Float32Array.from(mh), w, h, Math.max(1, Math.round(3 * w / LADO)), 3);
    // D. recorte cuadrado ajustado (+12 % por lado), fondo gris, reduccion por promedio de area
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, lado = Math.round(Math.max(bw, bh) * 1.24);
    const ox = Math.round(x0 + bw / 2 - lado / 2), oy = Math.round(y0 + bh / 2 - lado / 2);
    const out = new Uint8ClampedArray(salida * salida * 4), s = lado / salida;
    for (let j = 0; j < salida; j++) for (let i = 0; i < salida; i++) {
      const xa = ox + i * s, xb = ox + (i + 1) * s, ya = oy + j * s, yb = oy + (j + 1) * s;
      let acc = [0, 0, 0], peso = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        const wy = Math.min(yb, y + 1) - Math.max(ya, y);
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const wx = Math.min(xb, x + 1) - Math.max(xa, x), p = wx * wy;
          if (x < 0 || y < 0 || x >= w || y >= h) { acc[0] += GRIS * p; acc[1] += GRIS * p; acc[2] += GRIS * p; }
          else { const q = y * w + x, a = alfa[q]; for (let k = 0; k < 3; k++) acc[k] += (nd[3 * q + k] * a + GRIS * (1 - a)) * p; }
          peso += p;
        }
      }
      const o = 4 * (j * salida + i);
      out[o] = acc[0] / peso; out[o + 1] = acc[1] / peso; out[o + 2] = acc[2] / peso; out[o + 3] = 255;
    }
    return { data: out, width: salida, height: salida, fondo: bg, areaFruto: c.n / n };
  }
  return { localizar, preparar, LADO };
})();
export default Nucleo;
