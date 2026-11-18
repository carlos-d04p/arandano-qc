# Arándano QC

Aplicación web (PWA) que detecta **arándanos deshidratados** (con arrugamiento visible) a partir de una foto, usando un clasificador **YOLOv11n-cls** que corre directamente en el navegador del celular. Las fotos no se envían a ningún servidor.

- **Evaluar**: basta una foto del fruto desde cualquier ángulo. La app revisa la calidad de la foto (varios objetos, forma, desenfoque, tamaño, exposición, fondo), la preprocesa igual que el dataset y la clasifica. Si el resultado es dudoso, sugiere agregar otra vista (hasta 3) y promedia las probabilidades.
- **Lote**: guarda los frutos evaluados en el dispositivo, calcula el % defectuoso y exporta a CSV.
- **Validación**: mide el desempeño del modelo con fotos de celular. Se marca la clase real de cada fruto antes de fotografiarlo y la app calcula exactitud (con IC 95 % de Wilson), sensibilidad, especificidad, precisión, F1 y matriz de confusión, por foto y por fruto. Exporta a CSV.
- **Cómo funciona**: explica el proceso paso a paso, la regla de decisión, cómo tomar la foto, el modelo, sus resultados y sus limitaciones, con una demostración en vivo.

## Tecnología

| Parte | Herramienta |
|---|---|
| Interfaz | React 19 + TypeScript, compilado con Vite 8; tipografía IBM Plex (incluida, sin CDN) |
| Modelo | `public/modelo/best.onnx`, YOLOv11n-cls exportado desde Ultralytics (entrada 1×3×320×320, salida [deshidratado, sano]) |
| Inferencia | ONNX Runtime Web (WebAssembly) |
| Preprocesamiento | `src/lib/nucleo.js`, réplica en JavaScript de `procesar.py` + `armar_dataset.py`, ejecutado en un Web Worker |
| Instalación y modo sin conexión | `vite-plugin-pwa` (service worker con Workbox) |

## Regla de decisión

| P(deshidratado) | Veredicto |
|---|---|
| < 35 % | Cumple |
| 35 % – 65 % | Dudoso (revisar a mano) |
| ≥ 65 % | No cumple |

Los umbrales están en `src/lib/veredicto.ts`.

## Desarrollo local

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev        # http://localhost:5173 (también accesible desde el celular en la misma red)
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

> La cámara del celular solo funciona en `https://` o en `localhost`. Para probar desde el teléfono, usa el despliegue de Vercel.

## Publicar en GitHub y Vercel

1. Crea un repositorio en GitHub y sube esta carpeta:
   ```bash
   git remote add origin https://github.com/<usuario>/arandano-qc.git
   git push -u origin main
   ```
2. En [vercel.com](https://vercel.com) → **Add New… → Project** → importa el repositorio.
3. Vercel detecta Vite automáticamente (la configuración está en `vercel.json`): comando `npm run build`, carpeta `dist`. Pulsa **Deploy**.
4. Cada `git push` a `main` vuelve a desplegar la app.

## Actualizar el modelo

Después de reentrenar en Colab (`entrenar_yolo_colab.ipynb`), reemplaza `public/modelo/best.onnx` por el nuevo `runs/base/weights/best.onnx`, haz commit y push. Si cambias `IMGSZ` en el cuaderno, cambia también `ENTRADA` en `src/lib/procesar.ts`.

## Estructura

```
public/
  modelo/best.onnx        modelo entrenado
  ejemplos/               dos fotos reales para la demostración
src/
  App.tsx                 navegación y estado del modelo
  components/             Analizar (Evaluar), Lote, ComoFunciona, Escala, Iconos
  lib/nucleo.js           preprocesamiento (igual que el dataset)
  lib/preproceso.worker.ts
  lib/procesar.ts         decodifica la foto, localiza y recorta el fruto
  lib/modelo.ts           carga y ejecuta el modelo ONNX
  lib/veredicto.ts        umbrales y veredicto
  lib/lote.ts             lote guardado en el dispositivo y exportación CSV
  lib/validacion.ts       registros de validación, métricas y exportación
  lib/calidad.ts          control de calidad de la foto (umbrales calibrados con el dataset)
```

## Limitaciones

El modelo se entrenó con fotos de cámara réflex en laboratorio (fondo gris, luz controlada). Con la cámara de un celular y otra iluminación la precisión puede ser menor. Es un prototipo de investigación y no reemplaza la inspección oficial de calidad.
