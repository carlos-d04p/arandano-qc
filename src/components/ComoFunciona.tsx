import { useState } from 'react'
import { aDataURL, procesarFoto } from '../lib/procesar'
import { clasificar } from '../lib/modelo'
import { pct, UMBRAL_ALTO, UMBRAL_BAJO, veredicto } from '../lib/veredicto'
import { Candado, Check, Cruz, Flecha } from './Iconos'
import type { EstadoModelo } from '../App'

interface Demo {
  nombre: string
  original: string
  entrada: string
  p: number
}

function DemoEnVivo({ estadoModelo }: { estadoModelo: EstadoModelo }) {
  const [demos, setDemos] = useState<Demo[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function correr() {
    setCargando(true)
    setError('')
    try {
      const res: Demo[] = []
      for (const nombre of ['sano', 'deshidratado']) {
        const url = `${import.meta.env.BASE_URL}ejemplos/${nombre}.jpg`
        const blob = await (await fetch(url)).blob()
        const r = await procesarFoto(blob)
        res.push({ nombre, original: url, entrada: aDataURL(r.entrada), p: await clasificar(r.entrada) })
      }
      setDemos(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="demo">
      {!demos.length && (
        <button className="btn sec envolver" onClick={correr} disabled={cargando || estadoModelo === 'error'}>
          {cargando ? <span className="girando" /> : null} {cargando ? 'Procesando ejemplos…' : 'Ejecutar el proceso con dos frutos reales'}
        </button>
      )}
      {error && <div className="aviso">{error}</div>}
      {demos.map((d) => {
        const v = veredicto(d.p)!
        return (
          <div className="demo-fila" key={d.nombre}>
            <figure><img src={d.original} alt={`Foto original de un fruto ${d.nombre}`} /><figcaption>Foto · {d.nombre}</figcaption></figure>
            <Flecha className="muted" />
            <figure><img src={d.entrada} alt="Imagen preprocesada" /><figcaption>Entrada al modelo</figcaption></figure>
            <div className="demo-res">
              <span className={`chip ${v.clase}`}>{v.corto}</span>
              <b className="num" style={{ marginTop: 6 }}>{pct(d.p)}</b>
              <span className="small muted">P(desh.)</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ComoFunciona({ estadoModelo }: { estadoModelo: EstadoModelo }) {
  const bajo = Math.round(UMBRAL_BAJO * 100)
  const alto = Math.round(UMBRAL_ALTO * 100)

  return (
    <div className="guia">
      <section className="tarjeta guia-hero">
        <div className="eyebrow">Cómo funciona</div>
        <h2>Detección de deshidratación en arándanos con visión artificial</h2>
        <p>
          La app analiza la foto de un arándano y estima la probabilidad de que esté <b>deshidratado</b>, es decir, que
          presente <b>arrugamiento visible</b> de la piel (<i>shriveling</i>), un defecto definido visualmente en los
          estándares de calidad del USDA para arándanos. Todo el análisis ocurre en tu teléfono.
        </p>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>El proceso, paso a paso</h2></div>
        <ol className="pasos">
          <li>
            <h3>Captura</h3>
            <p>Fotografías el fruto sobre un fondo gris claro. Puedes tomar hasta tres vistas: corona (V1), cicatriz del pedúnculo (V2) y lateral (V3).</p>
          </li>
          <li>
            <h3>Localización del fruto</h3>
            <p>Sobre una copia reducida de la foto se detecta la región más oscura que el fondo (el fruto) y se recorta un cuadrado de unas dos veces su tamaño.</p>
          </li>
          <li>
            <h3>Normalización de color</h3>
            <p>Se mide el fondo en los bordes del recorte y se ajusta cada canal para que el fondo quede en un gris de referencia (140). Así se corrigen exposición y balance de blancos.</p>
          </li>
          <li>
            <h3>Segmentación y fondo neutro</h3>
            <p>Se separa el fruto del fondo, se suaviza su contorno con una envolvente convexa y el fondo se reemplaza por gris uniforme (128). Esto evita que el modelo aprenda «atajos» como manchas o tonos de la cartulina en lugar de las arrugas.</p>
          </li>
          <li>
            <h3>Clasificación con YOLOv11</h3>
            <p>La imagen de 320 × 320 px entra a una red neuronal YOLOv11n-cls entrenada con fotos propias. Devuelve la probabilidad de cada clase: sano o deshidratado.</p>
          </li>
          <li>
            <h3>Veredicto del fruto</h3>
            <p>Si tomaste varias vistas, se promedia la probabilidad de deshidratado y se aplica la regla de decisión de abajo. El fruto se puede guardar en el lote para obtener el porcentaje de defectuosos.</p>
          </li>
        </ol>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>Míralo en acción</h2></div>
        <p className="small muted" style={{ marginBottom: 12 }}>Estas dos fotos son del dataset de entrenamiento. El botón ejecuta exactamente el mismo proceso que se aplica a tus fotos.</p>
        <DemoEnVivo estadoModelo={estadoModelo} />
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>Regla de decisión</h2></div>
        <p className="small muted">Se usa P(deshidratado), la probabilidad que asigna el modelo a la clase defectuosa, con una franja intermedia para no forzar decisiones dudosas.</p>
        <div className="umbrales">
          <div className="umbral ok"><b>Cumple</b><span>P &lt; {bajo} %</span></div>
          <div className="umbral duda"><b>Dudoso</b><span>{bajo} – {alto} %, revisar a mano</span></div>
          <div className="umbral mal"><b>No cumple</b><span>P ≥ {alto} %</span></div>
        </div>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>Cómo tomar la foto</h2></div>
        <div className="dos-col">
          <div>
            <h4>Sí</h4>
            <ul className="lista-check si">
              <li><Check size={16} />Cartulina gris claro mate, limpia.</li>
              <li><Check size={16} />Un solo fruto, centrado, de 1/5 a 1/3 del ancho de la foto.</li>
              <li><Check size={16} />Luz difusa y pareja (junto a una ventana, sin sol directo).</li>
              <li><Check size={16} />Celular quieto y paralelo a la mesa; espera a que enfoque.</li>
            </ul>
          </div>
          <div>
            <h4>No</h4>
            <ul className="lista-check no">
              <li><Cruz size={16} />Flash o sombras duras junto al fruto.</li>
              <li><Cruz size={16} />Fondos con textura, color o manchas de jugo.</li>
              <li><Cruz size={16} />Varios frutos u objetos en la foto.</li>
              <li><Cruz size={16} />El fruto ocupando casi toda la imagen o desenfocado.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>El modelo</h2></div>
        <div className="prosa">
          <p>Se usó <b>YOLOv11n-cls</b> (Ultralytics), la variante más ligera de la familia, entrenada 60 épocas a 320 px partiendo de pesos preentrenados. El modelo exportado a ONNX pesa unos 6 MB y corre en el navegador con ONNX Runtime Web.</p>
          <p>La división en entrenamiento, validación y prueba se hizo <b>por fruto</b> (las tres vistas de un arándano quedan siempre en el mismo conjunto) para que el modelo nunca se evalúe con un fruto que ya vio.</p>
        </div>
        <div className="tabla-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Conjunto</th><th className="r">Sanos</th><th className="r">Deshidratados</th><th className="r">Total</th></tr></thead>
            <tbody className="num">
              <tr><td>Entrenamiento</td><td className="r">517</td><td className="r">582</td><td className="r">1 099</td></tr>
              <tr><td>Validación</td><td className="r">113</td><td className="r">126</td><td className="r">239</td></tr>
              <tr><td>Prueba</td><td className="r">110</td><td className="r">125</td><td className="r">235</td></tr>
              <tr><td><b>Total</b></td><td className="r"><b>740</b></td><td className="r"><b>833</b></td><td className="r"><b>1 573</b></td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Imágenes de 529 frutos (249 sanos y 280 deshidratados), fotografiados con cámara réflex en laboratorio.</p>

        <h3 style={{ fontSize: '0.95rem', margin: '18px 0 10px' }}>Resultados</h3>
        <div className="metricas">
          <div className="metrica"><b className="num">235/235</b><span>fotos de prueba bien clasificadas</span></div>
          <div className="metrica"><b className="num">79/79</b><span>frutos de prueba bien clasificados</span></div>
          <div className="metrica"><b className="num">99,9 %</b><span>exactitud media por foto en validación cruzada (5 folds)</span></div>
          <div className="metrica"><b className="num">100 %</b><span>exactitud por fruto en los 5 folds</span></div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          En el conjunto de prueba, la probabilidad más alta asignada a un fruto sano fue 4,7 % y la más baja asignada a uno deshidratado fue 99,5 %: ninguna foto cayó en la franja dudosa.
        </p>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>Limitaciones</h2></div>
        <div className="prosa">
          <p>Los resultados anteriores se obtuvieron en condiciones de laboratorio: misma cámara, misma cartulina y luz controlada. Con la cámara de un celular y otra iluminación la precisión puede ser menor; por eso la app reproduce el preprocesamiento del dataset y marca como dudosos los casos intermedios.</p>
          <p>La clase se asignó por <b>inspección visual</b> del arrugamiento; no se midió la pérdida de peso. Es un <b>prototipo de investigación</b> y no reemplaza la inspección oficial de calidad.</p>
        </div>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h2>Preguntas frecuentes</h2></div>
        <details className="faq">
          <summary>¿Necesito internet?</summary>
          <p>Solo la primera vez, para descargar la app y el modelo (unos 20 MB). Después funciona sin conexión. En el celular puedes instalarla desde el menú del navegador con «Agregar a pantalla de inicio».</p>
        </details>
        <details className="faq">
          <summary>¿Por qué tres vistas?</summary>
          <p>El arrugamiento no siempre se ve igual desde todos los ángulos. Promediar la corona, la cicatriz y el lateral da un veredicto más estable que una sola foto. Con una vista basta para obtener un resultado.</p>
        </details>
        <details className="faq">
          <summary>¿Por qué el fondo de la imagen procesada es gris?</summary>
          <p>Es intencional: el modelo se entrenó con el fondo reemplazado por gris uniforme para que se fije en la piel del fruto y no en la cartulina. Si el recorte se ve mal (fruto cortado o con fondo), repite la foto con mejor luz.</p>
        </details>
        <details className="faq">
          <summary>¿Qué pasa con mis fotos?</summary>
          <p>Nada sale del teléfono. Las fotos se procesan en el navegador y el lote se guarda en el almacenamiento local del dispositivo. Puedes exportarlo a CSV o vaciarlo cuando quieras.</p>
        </details>
      </section>

      <p className="pie"><Candado size={13} style={{ verticalAlign: '-2px' }} /> Procesamiento 100 % local · YOLOv11n-cls · ONNX Runtime Web</p>
    </div>
  )
}
