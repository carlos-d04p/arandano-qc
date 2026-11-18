import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 20, children, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...r}>
      {children}
    </svg>
  )
}

export const Camara = (p: P) => (
  <Base {...p}><path d="M14.5 4h-5L7.5 6.5H4.5A2 2 0 0 0 2.5 8.5v9a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.5" /></Base>
)
export const Galeria = (p: P) => (
  <Base {...p}><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L5 21" /></Base>
)
export const Escanear = (p: P) => (
  <Base {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="4" /></Base>
)
export const Lista = (p: P) => (
  <Base {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></Base>
)
export const Info = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="9.5" /><path d="M12 16.5v-5M12 8h.01" /></Base>
)
export const Check = (p: P) => (<Base {...p}><path d="M20 6 9 17l-5-5" /></Base>)
export const Cruz = (p: P) => (<Base {...p}><path d="M18 6 6 18M6 6l12 12" /></Base>)
export const Alerta = (p: P) => (
  <Base {...p}><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></Base>
)
export const Basura = (p: P) => (
  <Base {...p}><path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M18.5 6l-.8 13a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6" /></Base>
)
export const Descargar = (p: P) => (
  <Base {...p}><path d="M12 3v12M7 10l5 5 5-5M4 19.5h16" /></Base>
)
export const Copiar = (p: P) => (
  <Base {...p}><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></Base>
)
export const Flecha = (p: P) => (<Base {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Base>)
export const Mas = (p: P) => (<Base {...p}><path d="M12 5v14M5 12h14" /></Base>)
export const Sol = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Base>
)
export const Candado = (p: P) => (
  <Base {...p}><rect x="4" y="10.5" width="16" height="10.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></Base>
)
export const Capas = (p: P) => (
  <Base {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Base>
)
export const Objetivo = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Base>
)

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="marca-logo" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#463b6c" />
      <circle cx="32" cy="35" r="17" fill="#8d7fbf" />
      <circle cx="32" cy="35" r="17" fill="url(#brillo)" />
      <path d="M26.5 22.5 29 25.5l3-4 3 4 2.5-3-1 5.5h-9z" fill="#2c2545" />
      <defs>
        <radialGradient id="brillo" cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}
