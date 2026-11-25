import {
  el, pintar, repintar, insignia, formatoFecha, mensajeError, normalizar, turnoActual, vigente,
} from '../ui.js?v=202611250528';
import {
  cargarCatalogos, obtenerIniciativa, respuestasPendientesDe, integrantesDe, cambiosEstadoDatos, nombresEquipo, historialEstados, notasDe,
} from '../datos.js?v=202611250528';
import {
  FORMULARIOS, textoHerramienta, textoTipo, textoArea, motivos, MODALIDAD, FRECUENCIA, esIdea,
} from '../etiquetas.js?v=202611250528';
import { formulariosEdicion, sinGuardar } from './edicion.js?v=202611250528';
import { seccionSeguimiento } from './seguimiento.js?v=202611250528';
import { seccionIntegrantes } from './integrantes.js?v=202611250528';
import { seccionUsoDatos } from './semaforo.js?v=202611250528';

const esOperador = (perfil) => perfil.rol === 'admin' || perfil.rol === 'facilitador';

// El detalle es para ver: los formularios para corregir se abren con un botón.
// Se recuerda qué fichas están en edición, para que siga abierta al volver a pintar después de guardar.
const enEdicion = new Set();

// Al cerrar sesión (o al entrar otra persona): ninguna ficha queda abierta para editar.
export function olvidarEdicion() {
  enEdicion.clear();
}

// Detalle de un registro: el resumen de lo que llegó del formulario de Registro y, para admin y
// facilitador, los formularios para corregirlo. Arriba, la línea de tiempo con las notas.
// recarga: después de guardar, se vuelve a pintar sin mover el foco ni la página.
// seccion: 'integrantes' abre la ficha en esa sección, con "Agregar un integrante" desplegado.
export async function vistaRegistro(contenedor, perfil, codigo, { recarga = false, seccion: irA = null } = {}) {
  const turno = turnoActual();
  const volver = el('a', { class: 'enlace volver', href: '#/registros' }, '← Volver a Registros');
  const dibujar = recarga ? repintar : pintar;
  if (!recarga) pintar(contenedor, volver, el('h1', { text: codigo }), el('p', { class: 'cargando', text: 'Cargando…' }));

  let cat; let ini;
  try {
    [cat, ini] = await Promise.all([cargarCatalogos(), obtenerIniciativa(codigo)]);
  } catch (e) {
    if (!vigente(turno)) return;
    pintar(contenedor, volver, el('h1', { text: codigo }), el('p', { class: 'mensaje mensaje--error', role: 'alert', text: mensajeError(e) }));
    return;
  }
  if (!vigente(turno)) return;
  if (!ini) {
    // Igual si no existe o si no está a su alcance: la página no sugiere datos que el usuario no ve.
    pintar(contenedor, volver, el('h1', { text: codigo }), el('p', { text: 'No hay una iniciativa con ese código para mostrar.' }));
    return;
  }

  const p = ini.participante;
  // Si la persona ya se fue a otra sección mientras se guardaba, no se vuelve a pintar.
  const recargar = () => { if (vigente(turno)) vistaRegistro(contenedor, perfil, codigo, { recarga: true }); };

  // Respuestas de esta iniciativa que esperan revisión, aunque la iniciativa misma no esté
  // marcada. Si no se pueden consultar, simplemente no se avisa.
  // El semáforo de uso de datos solo lo ven admin y facilitador.
  const conSemaforo = esOperador(perfil) && Boolean(ini.estado_datos);
  const idea = esIdea(ini);
  const [pendientes, integrantes, cambiosColor, nombresQuien, cambiosEstado, notas] = await Promise.all([
    esOperador(perfil) ? respuestasPendientesDe(ini).catch(() => []) : [],
    integrantesDe(ini.id).catch(() => null),
    conSemaforo ? cambiosEstadoDatos(ini.id).catch(() => null) : [],
    conSemaforo ? nombresEquipo().catch(() => new Map()) : new Map(),
    // Línea de puntos de los estados y notas de cambio; si no se puede leer, la ficha sigue sin ella.
    historialEstados(ini.id).catch(() => null),
    notasDe(ini.id).catch(() => null),
  ]);
  if (!vigente(turno)) return;
  const area = textoArea(ini, cat.areas);

  dibujar(contenedor,
    volver,
    el('h1', {}, el('span', { class: 'codigo', text: ini.codigo }), ` · ${ini.nombre}`),
    el('div', { class: 'insignias' },
      ini.activa ? null : insignia('Desactivada', 'apagada'),
      ini.archivada ? insignia('Archivada', 'apagada') : null,
      ini.requiere_revision ? insignia('En revisión', 'atencion') : null,
      ini.track ? insignia(ini.track.nombre) : insignia('Sin herramienta asignada', 'apagada'),
      ini.estado ? insignia(ini.estado.nombre) : null,
    ),
    seccionPorAtender([
      ini.requiere_revision
        ? {
            tipo: 'revision',
            titulo: motivos(ini.motivo_revision).length === 1 ? 'En revisión' : `En revisión: ${motivos(ini.motivo_revision).length} puntos`,
            detalle: el('ul', { class: 'por-atender__motivos' }, motivos(ini.motivo_revision).map((m) => el('li', { text: m }))),
            accion: esOperador(perfil) ? el('a', { class: 'enlace enlace--tactil', href: `#/revision?iniciativa=${ini.codigo}` }, 'Resolver') : null,
          }
        : null,
      !ini.requiere_revision && pendientes.length
        ? {
            tipo: 'revision',
            titulo: pendientes.length === 1 ? '1 respuesta esperando revisión' : `${pendientes.length} respuestas esperando revisión`,
            detalle: [...new Set(pendientes.map((r) => FORMULARIOS[r.formulario] ?? r.formulario))].join(' y '),
            accion: el('a', { class: 'enlace enlace--tactil', href: `#/revision?iniciativa=${ini.codigo}` }, pendientes.length === 1 ? 'Revisarla' : 'Revisarlas'),
          }
        : null,
    ]),
    seccionSeguimiento(ini, {
      cambios: cambiosEstado, estados: cat.estados, notas: notas ?? [],
      error: notas === null ? 'notas' : null, operador: esOperador(perfil), recargar,
    }),
    el('div', { class: 'columnas' },
      // Quien llenó el Registro no se da por coordinador: quien coordina va en Integrantes.
      seccion('Quien registró', [
        ['Nombre', p.nombre],
        ['Correo', p.correo],
      ]),
      seccion('Iniciativa', [
        // El área es de la iniciativa, no de cada persona.
        ['Área', area],
        // Lo que escribió, solo si dice algo distinto del área asignada ("Por clasificar" ya lo incluye).
        ini.area_id && normalizar(ini.area_declarada) && normalizar(ini.area_declarada) !== normalizar(area)
          ? ['Área que escribió', ini.area_declarada] : null,
        ['Herramienta', textoHerramienta(ini)],
        ['Estado', ini.estado?.nombre ?? '—'],
        ['Tipo', textoTipo(ini)],
        ini.modalidad ? ['Forma de trabajo', MODALIDAD[ini.modalidad] ?? ini.modalidad] : null,
        ['Registrada', formatoFecha(ini.creado_en, { conHora: true })],
      ]),
    ),
    conSemaforo ? seccionUsoDatos(ini, cambiosColor, nombresQuien, { recargar }) : null,
    seccionIntegrantes(ini, integrantes, { operador: esOperador(perfil), recargar }),
    // Las preguntas cambian de tiempo verbal según el estado, como en el formulario: en Idea, lo que
    // se quiere hacer; en Prototipo o Producto, lo que ya hace.
    seccion('Lo que escribió', idea ? [
      ['Qué problema quiere resolver y cómo', ini.situacion_antes],
      ['Cómo imagina el resultado', ini.resultado_esperado],
      ['Quién más lo usaría', ini.usuario_identificado],
      ['Frecuencia de la tarea', FRECUENCIA[ini.frecuencia] ?? ini.frecuencia],
      ['Fuentes de datos o archivos que usaría', ini.datos_disponibles],
    ] : [
      ['Qué problema resuelve y qué hace', ini.situacion_antes],
      ['Cómo se usa hoy', ini.resultado_esperado],
      ['Quién lo usa hoy y quién más podría usarlo', ini.usuario_identificado],
      ['Frecuencia de la tarea', FRECUENCIA[ini.frecuencia] ?? ini.frecuencia],
      ['Fuentes de datos o archivos que usa', ini.datos_disponibles],
      esOperador(perfil) && !idea ? ['Siguiente paso', ini.siguiente_paso] : null,
    ]),
    esOperador(perfil) ? seccionEdicion(ini, cat, recargar) : null,
  );
  if (irA === 'integrantes' && !recarga) {
    const titulo = document.getElementById('integrantes-titulo');
    const agregar = document.getElementById('integrante-agregar');
    if (agregar) agregar.open = true;
    if (titulo) {
      titulo.setAttribute('tabindex', '-1');
      (titulo.closest('section') ?? titulo).scrollIntoView({ block: 'start' });
      titulo.focus({ preventScroll: true });
    }
  }
}

// "Por atender": una sola tarjeta con lo que hay que hacer en esta iniciativa, una fila por tarea
// con su acción a la derecha, en vez de avisos apilados. Cada fila lleva un punto
// del color de su tipo, como en Inicio; el texto dice siempre qué pasa.
//   tareas: [{ tipo: 'revision', titulo, detalle?, accion? }]
function seccionPorAtender(tareas) {
  const lista = tareas.filter(Boolean);
  if (!lista.length) return null;
  return el('section', { class: 'tarjeta por-atender', 'aria-labelledby': 'por-atender-titulo' },
    el('h2', { id: 'por-atender-titulo', text: lista.length === 1 ? 'Por atender' : `Por atender (${lista.length})` }),
    el('ul', { class: 'por-atender__lista' }, lista.map((t) => el('li', { class: `por-atender__fila por-atender__fila--${t.tipo}` },
      el('div', { class: 'por-atender__texto' },
        el('p', { class: 'por-atender__titulo', text: t.titulo }),
        typeof t.detalle === 'string' ? el('p', { class: 'por-atender__detalle', text: t.detalle }) : t.detalle ?? null),
      t.accion ? el('div', { class: 'por-atender__accion' }, t.accion) : null))));
}

// "Modificar datos de la iniciativa" abre los formularios de corrección; "Terminar de modificar"
// los cierra. Cada bloque se guarda con su propio botón.
function seccionEdicion(ini, cat, recargar) {
  const abierta = enEdicion.has(ini.codigo);
  const boton = el('button', {
    type: 'button', id: 'modificar-datos', class: abierta ? 'boton boton--secundario' : 'boton boton--principal',
    'aria-expanded': String(abierta), 'aria-controls': 'edicion-ficha',
  }, abierta ? 'Terminar de modificar' : 'Modificar datos de la iniciativa');
  const formularios = el('div', { id: 'edicion-ficha', hidden: !abierta || null },
    abierta ? formulariosEdicion(ini, cat, { alGuardar: recargar }) : null);
  boton.addEventListener('click', () => {
    const pendientes = sinGuardar(formularios);
    if (pendientes.length && !window.confirm(`Tienes cambios sin guardar en: ${pendientes.map((x) => x.titulo).join(', ')}. ¿Cerrar y descartarlos?`)) return;
    if (enEdicion.has(ini.codigo)) enEdicion.delete(ini.codigo);
    else enEdicion.add(ini.codigo);
    recargar();
  });
  return el('section', { class: 'bloque', 'aria-labelledby': 'corregir-titulo' },
    el('h2', { id: 'corregir-titulo', text: 'Corregir' }),
    abierta ? null : el('p', { class: 'texto-secundario', text: 'Esta ficha es para ver. Para corregir algún dato, ábrela en modo de edición.' }),
    el('div', { class: 'acciones' }, boton),
    formularios);
}

// Pares [etiqueta, valor]; un valor vacío se muestra como "—".
function seccion(titulo, pares) {
  return el('section', { class: 'tarjeta' },
    el('h2', { text: titulo }),
    el('dl', { class: 'datos' },
      pares.filter(Boolean).flatMap(([etiqueta, valor]) => [
        el('dt', { text: etiqueta }),
        el('dd', { class: valor ? 'texto-libre' : 'texto-secundario', text: valor || '—' }),
      ])));
}
