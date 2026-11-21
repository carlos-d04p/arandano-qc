import { useEffect, useState } from 'react'
import { aDataURL, procesarFoto } from '../lib/procesar'
import { clasificar } from '../lib/modelo'
import { pct, UMBRAL_ALTO, UMBRAL_BAJO, veredicto } from '../lib/veredicto'
import type { EstadoModelo } from '../App'

interface Demo {
  nombre: string
  original: string
  entrada: string
  p: number
}

const SECCIONES = [
  ['resumen', 'Resumen'],
  ['proceso', 'Proceso de análisis'],
  ['decision', 'Regla de decisión'],
  ['calidad', 'Control de calidad de la foto'],
  ['defectos', 'Otros defectos (experimental)'],
  ['varios', 'Varios frutos por foto'],
  ['lote', 'Lote y criterio de aceptación'],
  ['fotos', 'Toma de fotos'],
  ['modelo', 'Modelo y resultados'],
  ['validacion-campo', 'Validación con celular'],
  ['limitaciones', 'Limitaciones'],
  ['preguntas', 'Preguntas frecuentes'],
  ['acerca', 'Acerca de'],
] as const

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
        const r = await procesarFoto(await (await fetch(url)).blob())
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
      {!demos.length ? (
        <button className="btn sec envolver" onClick={correr} disabled={cargando || estadoModelo === 'error'}>
          {cargando && <span className="girando" />}
          {cargando ? 'Procesando…' : 'Ejecutar el análisis con dos muestras reales'}
        </button>
      ) : (
        <table className="demo-tabla">
          <thead>
            <tr><th>Foto original</th><th>Entrada al modelo</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            {demos.map((d) => {
              const v = veredicto(d.p)!
              return (
                <tr key={d.nombre}>
                  <td><img src={d.original} alt={`Fruto ${d.nombre}, foto original`} width={132} height={132} loading="lazy" /></td>
                  <td><img src={d.entrada} alt="Imagen preprocesada" width={132} height={132} loading="lazy" /></td>
                  <td>
                    <span className={`calidad ${v.clase}`}>{v.corto}</span>
                    <div className="mono small muted" style={{ marginTop: 2 }}>P = {pct(d.p)}</div>
                    <div className="small muted">Etiqueta real: {d.nombre}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {error && <div className="nota error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  )
}

export function ComoFunciona({ estadoModelo }: { estadoModelo: EstadoModelo }) {
  const bajo = Math.round(UMBRAL_BAJO * 100)
  const alto = Math.round(UMBRAL_ALTO * 100)

  const [activa, setActiva] = useState<string>(SECCIONES[0][0])

  // resalta en el índice la sección que se está leyendo
  useEffect(() => {
    let cuadro = 0
    const medir = () => {
      cuadro = 0
      let actual: string = SECCIONES[0][0]
      for (const [id] of SECCIONES) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 140) actual = id
      }
      // al llegar al final de la página, la última sección
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) actual = SECCIONES[SECCIONES.length - 1][0]
      setActiva(actual)
    }
    const alDesplazar = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', alDesplazar, { passive: true })
    window.addEventListener('resize', alDesplazar)
    return () => {
      window.removeEventListener('scroll', alDesplazar)
      window.removeEventListener('resize', alDesplazar)
      cancelAnimationFrame(cuadro)
    }
  }, [])

  const ir = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="doc">
      <nav className="indice" aria-label="Contenido">
        <p>En esta página</p>
        <ol>
          {SECCIONES.map(([id, t]) => (
            <li key={id}><a href={`#${id}`} onClick={(e) => ir(e, id)} aria-current={activa === id ? 'true' : undefined}>{t}</a></li>
          ))}
        </ol>
      </nav>

      <article className="articulo">
        <section id="resumen">
          <h1>Cómo funciona</h1>
          <p className="bajada">
            BerryScan estima, a partir de una fotografía, la probabilidad de que un arándano esté deshidratado,
            es decir, que presente arrugamiento visible de la piel (<i>shriveling</i>), defecto definido visualmente en los
            estándares de calidad del USDA para arándanos.
          </p>
          <p>
            El análisis se ejecuta por completo en el dispositivo: la imagen no se envía a ningún servidor. Basta una foto por
            fruto; si el resultado no es concluyente, la aplicación pide una vista adicional desde otro ángulo.
          </p>
        </section>

        <section id="proceso">
          <h2>Proceso de análisis</h2>
          <ol className="pasos">
            <li><span className="n">01</span><div><h3>Captura</h3><p>Se fotografía un fruto sobre una cartulina gris claro. Sirve cualquier vista: corona, cicatriz del pedúnculo o lateral.</p></div></li>
            <li><span className="n">02</span><div><h3>Localización</h3><p>En una copia reducida de la imagen se detecta la región más oscura que el fondo y se recorta un cuadrado de aproximadamente el doble del tamaño del fruto.</p></div></li>
            <li><span className="n">03</span><div><h3>Normalización de color</h3><p>Se mide el fondo en los bordes del recorte y se escala cada canal para llevarlo a un gris de referencia (140), corrigiendo exposición y balance de blancos.</p></div></li>
            <li><span className="n">04</span><div><h3>Segmentación</h3><p>Se separa el fruto del fondo, se regulariza el contorno con una envolvente convexa y el fondo se sustituye por gris uniforme (128). Así el modelo no puede apoyarse en manchas o tonos de la cartulina.</p></div></li>
            <li><span className="n">05</span><div><h3>Clasificación</h3><p>La imagen de 320 × 320 px se evalúa con una red YOLOv11n-cls, que devuelve la probabilidad de las clases «sano» y «deshidratado».</p></div></li>
            <li><span className="n">06</span><div><h3>Veredicto</h3><p>Se aplica la regla de decisión. Si hay varias vistas del mismo fruto, se promedian sus probabilidades.</p></div></li>
          </ol>
          <h3>Ejemplo</h3>
          <p>El siguiente botón ejecuta el mismo procedimiento sobre dos fotos del conjunto de datos.</p>
          <DemoEnVivo estadoModelo={estadoModelo} />
        </section>

        <section id="decision">
          <h2>Regla de decisión</h2>
          <p>Se usa la probabilidad de deshidratación P que entrega el modelo, con una franja intermedia para no forzar una decisión cuando el modelo no es concluyente.</p>
          <div className="tabla-wrap" style={{ marginTop: 12 }}>
            <table className="tabla">
              <thead><tr><th>P(deshidratado)</th><th>Resultado</th><th>Acción</th></tr></thead>
              <tbody>
                <tr><td className="mono">&lt; {bajo} %</td><td><span className="calidad ok">Cumple</span></td><td>Fruto aceptado</td></tr>
                <tr><td className="mono">{bajo} – {alto} %</td><td><span className="calidad duda">Dudoso</span></td><td>Agregar otra vista o revisar manualmente</td></tr>
                <tr><td className="mono">≥ {alto} %</td><td><span className="calidad mal">No cumple</span></td><td>Fruto rechazado</td></tr>
                <tr><td>&lt; {bajo} % con otros defectos</td><td><span className="calidad duda">Revisar</span></td><td>Confirmar a simple vista</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10 }}>
            El porcentaje es la seguridad del modelo de que el fruto pertenece a la clase «deshidratado», no el grado de deshidratación.
          </p>
        </section>

        <section id="calidad">
          <h2>Control de calidad de la foto</h2>
          <p>
            Antes de confiar en la predicción, la aplicación revisa que la foto se parezca a las del entrenamiento. Los umbrales se
            calibraron con 180 fotos válidas del conjunto de datos, las fotos que se excluyeron por movimiento y degradaciones simuladas.
          </p>
          <p>Si la foto tiene varios frutos, cada uno se analiza por separado (ver <i>Varios frutos por foto</i>).</p>
          <h3>La foto no se analiza si…</h3>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Problema</th><th>Criterio</th></tr></thead>
              <tbody>
                <tr><td>La forma es demasiado alargada</td><td>Relación ancho/alto &lt; 0,5 (en el dataset, mínimo 0,58)</td></tr>
                <tr><td>La forma es irregular</td><td>Área / envolvente convexa &lt; 0,55 (en el dataset, mínimo 0,68)</td></tr>
              </tbody>
            </table>
          </div>
          <h3>La foto se analiza, pero el resultado se marca como poco confiable si…</h3>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Advertencia</th><th>Criterio</th></tr></thead>
              <tbody>
                <tr><td>Desenfocada o movida</td><td>Definición del contorno del fruto &lt; 0,036 (pendiente del borde dividida por el contraste; no depende de si la piel es lisa o arrugada)</td></tr>
                <tr><td>Fruto muy pequeño</td><td>Menos del 15 % del lado menor de la foto o menos de 220 px</td></tr>
                <tr><td>Foto oscura o sobreexpuesta</td><td>Gris mediano de la foto fuera del rango 70–225</td></tr>
                <tr><td>Fondo con manchas o textura</td><td>Desviación estándar del gris del fondo &gt; 28</td></tr>
                <tr><td>Color poco habitual</td><td>Saturación del color del fruto &gt; 0,70</td></tr>
                <tr><td>Objeto oscuro cercano</td><td>Segundo objeto entre el 25 % y el 40 % del área del fruto (solo con un fruto por foto)</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10 }}>
            Estos controles detectan problemas evidentes, no garantizan que una foto sea perfecta: un desenfoque leve puede pasar inadvertido.
            En la sección Validación, las fotos con advertencias quedan marcadas y pueden excluirse de las métricas.
          </p>
        </section>

        <section id="defectos">
          <h2>Otros defectos (experimental)</h2>
          <p>
            El modelo solo fue entrenado para distinguir frutos sanos de deshidratados. Para no pasar por alto otros problemas, la aplicación
            hace además una revisión de la forma y el color del fruto, sin inteligencia artificial. Si encuentra algo fuera de lo habitual en un fruto
            que el modelo da por sano, el veredicto pasa de «Cumple» a «Revisar», para confirmarlo a simple vista. En el lote, esos frutos cuentan
            como dudosos.
          </p>
          <div className="tabla-wrap" style={{ marginTop: 12 }}>
            <table className="tabla">
              <thead><tr><th>Indicador</th><th>Qué puede señalar</th><th>Criterio</th></tr></thead>
              <tbody>
                <tr><td>Contorno irregular</td><td>Abolladura, deformación, arrugas profundas o pedicelo adherido</td><td>Área / envolvente convexa del contorno &lt; 0,978</td></tr>
                <tr><td>Zonas rojizas</td><td>Herida, rajadura, pulpa expuesta o jugo (exudado)</td><td>Más del 0,5 % de la piel con tono rojo-morado</td></tr>
                <tr><td>Grieta o rajadura</td><td>Partidura, rajadura o daño mecánico</td><td>Zona café-anaranjada alargada de más del 32 % del diámetro</td></tr>
                <tr><td>Mancha café</td><td>Herida seca, pudrición, golpe o quemadura de sol</td><td>Más del 4 % de la piel café-anaranjada</td></tr>
              </tbody>
            </table>
          </div>
          <h3>Calibración</h3>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Fotos</th><th className="r">Contorno</th><th className="r">Rojizas</th><th className="r">Grieta</th><th className="r">Mancha</th></tr></thead>
              <tbody className="mono">
                <tr><td>Sanos del dataset (740)</td><td className="r">3</td><td className="r">0</td><td className="r">0</td><td className="r">2</td></tr>
                <tr><td>Deshidratados del dataset (833)</td><td className="r">180</td><td className="r">98</td><td className="r">1</td><td className="r">3</td></tr>
                <tr><td>Deshidratados, celular (30)</td><td className="r">11</td><td className="r">6</td><td className="r">—</td><td className="r">—</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10 }}>
            Los «sanos» del dataset se etiquetaron solo por deshidratación, y algunos tienen heridas reales: los dos marcados con mancha café las
            tienen. La cicatriz del pedúnculo, el cáliz de la corona y la capa cerosa clara no cuentan como defectos; por eso las grietas cortas que
            nacen de la cicatriz pueden pasar inadvertidas. Esta revisión no detecta moho,
            magulladuras sin deformación ni defectos que no se vean en la foto. Para detectarlos de forma confiable habría que fotografiar y
            etiquetar frutos con esos defectos y entrenar el modelo con más clases.
          </p>
        </section>

        <section id="varios">
          <h2>Varios frutos por foto</h2>
          <p>
            Si la foto tiene varios arándanos, la aplicación los separa y evalúa cada uno por separado, con el mismo preprocesamiento que una foto
            individual: recorta cada fruto, tapa a los vecinos con el color del fondo y lo lleva a 320 × 320 px. En la foto se numera cada fruto con
            un recuadro del color de su resultado, y todos pueden guardarse en el lote de una vez. Subir varias imágenes a la vez también las trata
            como frutos distintos: nunca se promedian como vistas del mismo fruto.
          </p>
          <ul className="lista-doc" style={{ marginTop: 10 }}>
            <li>Los frutos deben estar separados entre sí. Si dos se tocan, se detectan como un solo objeto de forma irregular y no se analizan.</li>
            <li>Un fruto cortado por el borde de la foto no se analiza.</li>
            <li>Cada fruto debe medir al menos unos 220 px en la foto: con un celular de 12 MP caben cómodamente 10 a 15 frutos.</li>
            <li>Cada fruto se ve desde un solo ángulo; para confirmar un dudoso, fotografíalo solo y agrega otra vista.</li>
          </ul>
          <p style={{ marginTop: 10 }}>
            En una prueba con 12 frutos del conjunto de prueba (6 sanos y 6 deshidratados) reunidos en una sola imagen, los 12 se detectaron y cada uno
            obtuvo el mismo resultado que analizado por separado. Conviene confirmarlo con fotos reales en la sección Validación, que también acepta fotos con varios frutos.
          </p>
        </section>

        <section id="lote">
          <h2>Lote y criterio de aceptación</h2>
          <p>
            En la sección <b>Lote</b> se registran los datos del lote (código, productor, variedad, fecha y responsable) y el criterio con que se
            acepta o rechaza:
          </p>
          <ul className="lista-doc" style={{ marginTop: 10 }}>
            <li><b>Tolerancia:</b> porcentaje máximo de frutos defectuosos (5 % por defecto). El lote se acepta si no se supera.</li>
            <li><b>Muestra mínima:</b> número de frutos a partir del cual el dictamen deja de ser provisional (30 por defecto).</li>
            <li><b>Dudosos:</b> pueden contar como defectuosos (criterio conservador) o excluirse del cálculo.</li>
            <li><b>Otros defectos:</b> opcionalmente, los frutos marcados en la revisión experimental cuentan como defectuosos.</li>
          </ul>
          <p style={{ marginTop: 10 }}>
            Junto al porcentaje de defectuosos se muestra su intervalo de confianza al 95 % (Wilson). Si el porcentaje está dentro de la
            tolerancia pero el intervalo la supera, la aplicación sugiere ampliar la muestra. El informe puede imprimirse o guardarse como PDF y
            los datos se exportan a CSV. Los valores por defecto son ilustrativos: ajústalos al estándar o contrato que se aplique.
          </p>
        </section>

        <section id="fotos">
          <h2>Toma de fotos</h2>
          <p>El modelo se entrenó con fotos en condiciones controladas. Mientras más se parezca la foto a esas condiciones, más confiable será el resultado.</p>
          <div className="dos-col">
            <div>
              <h3>Recomendado</h3>
              <ul className="lista-doc">
                <li>Cartulina gris claro mate y limpia.</li>
                <li>Un solo fruto, centrado, de 1/5 a 1/3 del ancho de la imagen.</li>
                <li>Luz difusa y pareja, por ejemplo junto a una ventana.</li>
                <li>Celular estable y paralelo a la mesa.</li>
              </ul>
            </div>
            <div>
              <h3>Evitar</h3>
              <ul className="lista-doc">
                <li>Flash, sol directo o sombras marcadas.</li>
                <li>Fondos con textura, color o manchas de jugo.</li>
                <li>Varios frutos u otros objetos en la imagen.</li>
                <li>Fruto desenfocado o que ocupe casi toda la foto.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="modelo">
          <h2>Modelo y resultados</h2>
          <p>
            Se utilizó YOLOv11n-cls (Ultralytics), la variante más ligera de la familia, entrenada durante 60 épocas con
            imágenes de 320 px a partir de pesos preentrenados. Exportado a ONNX ocupa unos 6 MB y se ejecuta en el navegador con ONNX Runtime Web.
          </p>
          <p>
            La partición en entrenamiento, validación y prueba se hizo por fruto: las vistas de un mismo arándano pertenecen siempre al mismo conjunto,
            de modo que el modelo nunca se evalúa con un fruto que ya vio.
          </p>

          <h3>Conjunto de datos</h3>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Conjunto</th><th className="r">Sanos</th><th className="r">Deshidratados</th><th className="r">Imágenes</th></tr></thead>
              <tbody className="mono">
                <tr><td>Entrenamiento</td><td className="r">517</td><td className="r">582</td><td className="r">1 099</td></tr>
                <tr><td>Validación</td><td className="r">113</td><td className="r">126</td><td className="r">239</td></tr>
                <tr><td>Prueba</td><td className="r">110</td><td className="r">125</td><td className="r">235</td></tr>
              </tbody>
              <tfoot className="mono"><tr><td>Total</td><td className="r">740</td><td className="r">833</td><td className="r">1 573</td></tr></tfoot>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>1 573 imágenes de 529 frutos (249 sanos y 280 deshidratados), tomadas con cámara réflex en laboratorio.</p>

          <h3>Resultados en el conjunto de prueba</h3>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Evaluación</th><th className="r">Aciertos</th><th className="r">Exactitud</th></tr></thead>
              <tbody className="mono">
                <tr><td>Por foto (una vista)</td><td className="r">235 / 235</td><td className="r">100 %</td></tr>
                <tr><td>Por fruto (promedio de vistas)</td><td className="r">79 / 79</td><td className="r">100 %</td></tr>
                <tr><td>Validación cruzada, 5 folds, por foto</td><td className="r">—</td><td className="r">99,9 %</td></tr>
                <tr><td>Validación cruzada, 5 folds, por fruto</td><td className="r">—</td><td className="r">100 %</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10 }}>
            Cada vista por separado (corona, cicatriz y lateral) acertó todos los casos de prueba, por lo que una sola foto es suficiente.
            La probabilidad más alta asignada a un fruto sano fue 4,7 % y la más baja asignada a uno deshidratado fue 99,5 %.
          </p>
        </section>

        <section id="validacion-campo">
          <h2>Validación con celular</h2>
          <p>
            La sección <b>Validación</b> permite medir el desempeño del modelo con las fotos y el celular que se usarán en la práctica,
            fuera de las condiciones de laboratorio del entrenamiento.
          </p>
          <ol className="lista-doc" style={{ marginTop: 10 }}>
            <li>Separa frutos cuya clase conozcas por inspección visual (idealmente al menos 30 de cada clase).</li>
            <li>Para cada fruto, marca su clase real <i>antes</i> de tomar la foto; así la etiqueta no se ve influida por la predicción.</li>
            <li>Opcionalmente agrega hasta dos vistas más del mismo fruto para obtener también las métricas por fruto.</li>
            <li>Exporta el CSV o copia el resumen: incluye exactitud con intervalo de confianza al 95 % (Wilson), sensibilidad, especificidad, precisión, F1, matriz de confusión y fotos rechazadas.</li>
          </ol>
          <p style={{ marginTop: 10 }}>
            Las métricas usan el umbral de 50 % con «deshidratado» como clase positiva, igual que la evaluación del cuaderno de entrenamiento,
            por lo que los resultados de laboratorio y de celular son directamente comparables.
          </p>
        </section>

        <section id="limitaciones">
          <h2>Limitaciones</h2>
          <p>
            Los resultados anteriores corresponden a condiciones de laboratorio: misma cámara, misma cartulina y luz controlada. Con la cámara
            de un celular y otra iluminación el desempeño puede ser menor. Por eso la aplicación replica el preprocesamiento del conjunto de datos,
            reserva una franja de resultados dudosos e incluye la sección Validación para cuantificar el desempeño en esas condiciones.
          </p>
          <p>
            La clase se asignó por inspección visual del arrugamiento; no se midió la pérdida de peso. Se trata de un prototipo de investigación
            que no sustituye la inspección oficial de calidad.
          </p>
        </section>

        <section id="preguntas">
          <h2>Preguntas frecuentes</h2>
          <details className="faq">
            <summary>¿Cuántas fotos necesito por fruto?</summary>
            <p>Una. Si el resultado es «Dudoso», la aplicación sugiere agregar otra vista del mismo fruto (hasta tres) y promedia los resultados.</p>
          </details>
          <details className="faq">
            <summary>¿Necesito conexión a internet?</summary>
            <p>Solo la primera vez, para descargar la aplicación y el modelo (unos 20 MB). Después funciona sin conexión. En el celular se puede instalar desde el menú del navegador con «Agregar a la pantalla de inicio».</p>
          </details>
          <details className="faq">
            <summary>¿Por qué la imagen procesada tiene fondo gris?</summary>
            <p>El modelo se entrenó con el fondo reemplazado por gris uniforme para que se concentre en la piel del fruto. Si el recorte aparece cortado o con restos de fondo, conviene repetir la foto con mejor luz.</p>
          </details>
          <details className="faq">
            <summary>Un fruto con arrugas leves sale con 0 %. ¿Por qué?</summary>
            <p>
              El porcentaje no es el grado de deshidratación: es la seguridad del modelo de que el fruto pertenece a la clase «deshidratado».
              El modelo se entrenó solo con dos clases bien diferenciadas (piel lisa y arrugamiento visible), por eso sus probabilidades
              suelen estar cerca de 0 % o de 100 %. Un arrugamiento leve, que no estaba representado en el entrenamiento, tiende a quedar del lado
              «sano». Para graduar la severidad habría que etiquetar frutos con deshidratación leve como una clase propia y volver a entrenar.
            </p>
          </details>
          <details className="faq">
            <summary>¿Qué pasa con mis fotos y resultados?</summary>
            <p>Las fotos se procesan en el navegador y no se guardan. El lote se almacena en el propio dispositivo y puede exportarse a CSV o vaciarse en cualquier momento.</p>
          </details>
        </section>

        <section id="acerca">
          <h2>Acerca de</h2>
          <p>
            BerryScan es un prototipo de investigación para apoyar la inspección de calidad de arándanos frescos. Detecta la deshidratación
            (arrugamiento visible) con visión artificial desde el celular, sin enviar las fotos a ningún servidor.
          </p>
          <div className="tabla-wrap" style={{ marginTop: 12 }}>
            <table className="tabla">
              <tbody>
                <tr><th>Versión</th><td className="mono">{__VERSION__} · {__FECHA__}</td></tr>
                <tr><th>Modelo</th><td>YOLOv11n-cls (Ultralytics), 320 × 320 px, exportado a ONNX</td></tr>
                <tr><th>Ejecución</th><td>ONNX Runtime Web (WebAssembly) en el propio dispositivo</td></tr>
                <tr><th>Aplicación</th><td>React, TypeScript y Vite; instalable y usable sin conexión (PWA)</td></tr>
                <tr><th>Datos</th><td>Fotos y lotes se guardan solo en el dispositivo</td></tr>
                <tr><th>Código</th><td><a href="https://github.com/carlos-d04p/arandano-qc" target="_blank" rel="noreferrer">github.com/carlos-d04p/arandano-qc</a></td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Herramienta de apoyo: no sustituye la inspección oficial de calidad ni la evaluación de un especialista.
          </p>
        </section>
      </article>
    </div>
  )
}
