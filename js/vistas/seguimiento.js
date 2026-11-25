import { el, formatoFecha, campo, conBoton, errorEn, errorCampo, mensajeError, avisar } from '../ui.js?v=202611250528';
import { agregarNota, archivarIniciativa } from '../datos.js?v=202611250528';

// Línea de tiempo de la ficha: arriba, los estados en una línea de puntos (Idea, Prototipo,
// Producto) con el actual marcado y la fecha de cada uno que ya se alcanzó; abajo, de la más nueva
// a la más vieja, el registro de la iniciativa, los cambios de estado, el archivo y las notas que
// agregan admin y facilitador ("Agregar nota", bitácora manual).
//   cambios: historial de estados [{ cambiado_en, estado: { id, nombre, orden } }] del más viejo al
//     más nuevo (null si no se pudo leer); estados: catálogo de estados para dibujar los puntos.
//   notas: de notasDe() [{ tipo, texto, autor, creado_en }]; las ve quien puede ver la iniciativa.
//   operador + recargar: muestran "Agregar nota" y "Archivar iniciativa".
export function seccionSeguimiento(ini, { cambios = null, estados = [], notas = [], error = null, operador = false, recargar = () => {} } = {}) {
  const titulo = el('h2', { id: 'seguimiento-titulo', text: 'Línea de tiempo' });
  const seccion = (...hijos) => el('section', { class: 'tarjeta seguimiento', 'aria-labelledby': 'seguimiento-titulo' }, ...hijos);
  if (error) {
    return seccion(titulo, el('p', { class: 'mensaje mensaje--error', role: 'alert', text: 'No se pudieron cargar las notas. Vuelve a abrir la ficha en un momento.' }));
  }
  // El primer registro del historial es el estado con el que nació la iniciativa (se guarda al crearla):
  // ya lo cuenta "Se registró". Si nació sin estado (herramienta por asignar), el primero es un cambio
  // posterior y sí se muestra: por eso se descarta solo si es de la misma hora en que se creó.
  const lista = cambios ?? [];
  const alNacer = lista.length && Math.abs(new Date(lista[0].cambiado_en) - new Date(ini.creado_en)) < 60000;
  const cambiosDeEstado = alNacer ? lista.slice(1) : lista;
  const entradas = [
    ...notas.map((n) => ({
      fecha: n.creado_en, autor: n.autor,
      texto: n.tipo === 'archivada' ? `Se archivó la iniciativa.${n.texto ? ` ${n.texto}` : ''}`
        : n.tipo === 'desarchivada' ? `Se sacó la iniciativa del archivo.${n.texto ? ` ${n.texto}` : ''}`
        : n.texto,
    })),
    ...cambiosDeEstado.map((c) => ({ fecha: c.cambiado_en, texto: `Pasó a ${c.estado?.nombre ?? 'otro estado'}.`, autor: null })),
    { fecha: ini.creado_en, texto: 'Se registró la iniciativa.', autor: null },
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return seccion(titulo,
    lineaEstados(ini, cambios, estados),
    operador ? acciones(ini, recargar) : null,
    el('ol', { class: 'linea__avances' }, entradas.map((e) => el('li', {},
      el('article', { class: 'linea__avance' },
        el('p', { class: 'linea__fecha' }, formatoFecha(e.fecha, { conHora: true }),
          e.autor ? el('span', { class: 'texto-secundario', text: ` · ${e.autor}` }) : null),
        el('p', { class: 'texto-libre', text: e.texto }))))));
}

// "Agregar nota" (texto libre, queda con fecha y autor) y "Archivar iniciativa" / "Sacar del archivo"
// (nota opcional). Archivar no es desactivar: la iniciativa sigue viva, solo sale de las listas e indicadores.
function acciones(ini, recargar) {
  const texto = el('textarea', { rows: 3, maxlength: 2000 });
  const guardar = el('button', { type: 'submit', class: 'boton boton--principal', id: 'nota-guardar' }, 'Guardar nota');
  const formulario = el('form', { novalidate: true },
    campo('nota-texto', 'Nota', texto, 'Queda en la línea de tiempo con la fecha y tu nombre. La ven también quienes consultan la plataforma.'),
    el('div', { class: 'acciones' }, guardar));
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEn(formulario, null);
    if (!texto.value.trim()) { errorCampo(texto, 'Escribe la nota.'); return; }
    try {
      await conBoton(guardar, 'Guardando…', () => agregarNota(ini.id, texto.value.trim()));
      avisar('Nota agregada.');
      recargar();
    } catch (err) {
      errorEn(formulario, mensajeError(err));
    }
  });

  const motivo = el('input', { type: 'text', maxlength: 2000 });
  const confirmar = el('button', { type: 'submit', class: 'boton boton--secundario', id: 'archivar-confirmar' },
    ini.archivada ? 'Sacar del archivo' : 'Archivar iniciativa');
  const archivo = el('form', { novalidate: true },
    campo('archivar-nota', 'Nota (opcional)', motivo, ini.archivada
      ? 'Por qué vuelve a las listas.'
      : 'Por qué se archiva. Deja de aparecer en Inicio, Progreso y en la lista normal de Registros; se ve en "Archivadas".'),
    el('div', { class: 'acciones' }, confirmar));
  archivo.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEn(archivo, null);
    try {
      await conBoton(confirmar, ini.archivada ? 'Sacando…' : 'Archivando…', () => archivarIniciativa(ini.id, !ini.archivada, motivo.value.trim()));
      avisar(ini.archivada ? `${ini.codigo} salió del archivo.` : `${ini.codigo} quedó archivada.`);
      recargar();
    } catch (err) {
      errorEn(archivo, mensajeError(err));
    }
  });

  return el('div', { class: 'seguimiento__acciones' },
    el('details', { class: 'desplegable', id: 'nota-agregar' }, el('summary', { text: 'Agregar una nota' }), formulario),
    el('details', { class: 'desplegable', id: 'archivar-idea' },
      el('summary', { text: ini.archivada ? 'Sacar del archivo' : 'Archivar la iniciativa' }), archivo));
}

// Los estados de la herramienta de la iniciativa, en orden. Los alcanzados van rellenos, el actual con
// anillo y los que faltan, vacíos. Sin herramienta, los nombres del catálogo (son iguales en las dos).
function lineaEstados(ini, cambios, estados) {
  const delTrack = estados.filter((e) => e.activo && (!ini.track_id || e.track_id === ini.track_id));
  const lista = [...new Map(delTrack.sort((a, b) => a.orden - b.orden).map((e) => [e.nombre, e])).values()];
  if (!lista.length || !ini.estado) return null;
  const actual = ini.estado.orden;
  // La fecha en que se llegó a cada estado: la más reciente vez que se puso.
  const fechaDe = (e) => [...(cambios ?? [])].reverse().find((c) => c.estado?.id === e.id || c.estado?.nombre === e.nombre)?.cambiado_en;
  return el('ol', { class: 'pasos', 'aria-label': 'Estado de la iniciativa' }, lista.map((e) => {
    const fecha = e.orden <= actual ? fechaDe(e) : null;
    const clase = e.orden < actual ? 'hecho' : e.orden === actual ? 'actual' : 'pendiente';
    return el('li', { class: `paso paso--${clase}`, 'aria-current': e.orden === actual ? 'step' : null },
      el('span', { class: 'paso__punto', 'aria-hidden': 'true' }),
      el('span', { class: 'paso__nombre', text: e.nombre }),
      el('span', { class: 'paso__fecha', text: fecha ? formatoFecha(fecha) : e.orden > actual ? 'Pendiente' : '' }));
  }));
}
