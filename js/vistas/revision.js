import {
  el, pintar, repintar, enfocar, insignia, formatoFecha, mensajeError, avisar, campo,
  conBoton, errorCampo, errorEn, conteoRevision, turnoActual, vigente,
} from '../ui.js?v=202611250528';
import {
  cargarCatalogos, listarRevisiones, listarResueltas, iniciativasEnRevision,
  nombresEquipo, reintentar, resolverRevision, reabrirRevision, estadoRespuesta, actualizarIniciativa,
} from '../datos.js?v=202611250528';
import { FORMULARIOS, paresRespuesta, motivos } from '../etiquetas.js?v=202611250528';
import { formulariosEdicion, sinGuardar } from './edicion.js?v=202611250528';

let pestana = 'registro';

// Al cerrar sesión: la pestaña elegida no pasa a la persona que entre después.
export function olvidarPestanaRevision() {
  pestana = 'registro';
}
const LIMITE_RESUELTAS = 50;

// Respuestas en revisión (admin y facilitador), como una bandeja de entrada: cada tarjeta dice
// primero por qué está aquí; se corrige lo que haga falta y se resuelve con una nota, y el foco
// pasa a la siguiente. Nada se borra: la base guarda quién y cuándo.
// recarga: después de una acción, se vuelve a pintar sin mover la página.
// enfocar: código de iniciativa (INI-001) cuyas tarjetas se resaltan y reciben el foco al abrir.
// foco: { panel, indice } tarjeta a la que pasa el foco si el control usado ya no existe
// (la tarjeta se resolvió): la que quedó en su lugar, es decir, la siguiente.
export async function vistaRevision(contenedor, perfil, { recarga = false, enfocar: codigo = null, foco = null } = {}) {
  const turno = turnoActual();
  // Si la persona ya se fue a otra sección mientras se guardaba, no se vuelve a pintar.
  const recargar = (opciones = {}) => { if (vigente(turno)) vistaRevision(contenedor, perfil, { recarga: true, ...opciones }); };
  if (!recarga) pintar(contenedor, el('h1', { text: 'Respuestas en revisión' }), el('p', { class: 'cargando', text: 'Cargando…' }));

  let cat; let pendientes; let iniciativas; let resueltas; let nombres;
  try {
    [cat, pendientes, iniciativas, resueltas, nombres] = await Promise.all([
      cargarCatalogos(), listarRevisiones(), iniciativasEnRevision(), listarResueltas(LIMITE_RESUELTAS), nombresEquipo(),
    ]);
  } catch (e) {
    if (!vigente(turno)) return;
    pintar(contenedor, el('h1', { text: 'Respuestas en revisión' }), el('p', { class: 'mensaje mensaje--error', role: 'alert', text: mensajeError(e) }));
    return;
  }
  if (!vigente(turno)) return;

  // Iniciativas en revisión cuya respuesta de origen no está en la lista (datos sintéticos,
  // creadas por el admin o con la respuesta ya resuelta): se resuelven quitando la marca.
  const enLista = new Set(pendientes.map((r) => r.iniciativa?.id).filter(Boolean));
  const sueltas = iniciativas.filter((i) => !enLista.has(i.id));
  const total = pendientes.length + sueltas.length;
  conteoRevision(total);
  // Lo que queda después de resolver una: se dice al confirmar, para que se note el avance.
  const quedan = total - 1;

  const quien = (r) => {
    const autor = r.resuelto_por;
    if (!autor) return 'Sin usuario: se resolvió al volver a procesarla o desde la base';
    if (autor === perfil.usuarioId) return 'Tú';
    return nombres.get(autor) ?? 'Otra persona del equipo';
  };

  // Solo llega el formulario de Registro. Las iniciativas en revisión sin respuesta pendiente
  // van con él: son datos de la iniciativa.
  const deFormulario = (formulario) => pendientes.filter((r) => r.formulario === formulario);
  const VACIO = { registro: 'Todo al día: no hay Registros en revisión.' };
  const panelPendientes = (formulario, lista, extra = null) => el('div', {
    id: `panel-${formulario}`, role: 'tabpanel', 'aria-labelledby': `pestana-${formulario}`,
  },
    lista.length || extra
      ? null
      : el('p', { class: 'vacio vacio--al-dia', text: VACIO[formulario] }),
    lista.length
      ? el('ol', { class: 'lista-tarjetas' }, lista.map((r) => el('li', {}, tarjetaRespuesta(r, cat, recargar, quedan, perfil.rol === 'admin'))))
      : null,
    extra);
  const deRegistro = deFormulario('registro');
  const panelRegistro = panelPendientes('registro', deRegistro, sueltas.length
    ? el('section', { class: 'bloque', 'aria-labelledby': 'sueltas-titulo' },
        el('h2', { id: 'sueltas-titulo', text: 'Iniciativas en revisión sin respuesta pendiente' }),
        el('p', { class: 'texto-secundario', text: 'Vienen de datos cargados a mano o su respuesta ya se resolvió. Corrige en su registro y quita la marca.' }),
        el('ol', { class: 'lista-tarjetas' }, sueltas.map((i) => el('li', {}, tarjetaIniciativa(i, recargar, quedan)))))
    : null);
  const panelResueltas = el('div', { id: 'panel-resueltas', role: 'tabpanel', 'aria-labelledby': 'pestana-resueltas' },
    resueltas.length
      ? el('ol', { class: 'lista-tarjetas' }, resueltas.map((r) => el('li', {}, tarjetaResuelta(r, quien(r), perfil.rol === 'admin', recargar))))
      : el('p', { class: 'vacio', text: 'Todavía no hay respuestas resueltas.' }),
    resueltas.length === LIMITE_RESUELTAS
      ? el('p', { class: 'nota', text: `Se muestran las ${LIMITE_RESUELTAS} resueltas más recientes.` })
      : null);

  const pestanas = [
    { id: 'registro', texto: `Registro (${deRegistro.length + sueltas.length})`, panel: panelRegistro, codigos: [...deRegistro.map(codigoDe), ...sueltas.map((i) => i.codigo)] },
    { id: 'resueltas', texto: `Resueltas (${resueltas.length})`, panel: panelResueltas, codigos: [] },
  ];
  const botones = pestanas.map((t) => el('button', {
    type: 'button', role: 'tab', id: `pestana-${t.id}`, class: 'pestana', 'aria-controls': `panel-${t.id}`,
    onclick: () => { pestana = t.id; mostrarPestana(); },
  }, t.texto));
  const lista = el('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Respuestas' }, botones);
  // Flechas, Inicio y Fin para moverse entre pestañas (patrón de pestañas accesibles).
  lista.addEventListener('keydown', (e) => {
    const i = pestanas.findIndex((t) => t.id === pestana);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1 + pestanas.length, Home: 0, End: pestanas.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    pestana = pestanas[destino % pestanas.length].id;
    mostrarPestana();
    botones[pestanas.findIndex((t) => t.id === pestana)].focus();
  });
  function mostrarPestana() {
    pestanas.forEach((t, i) => {
      const activa = t.id === pestana;
      botones[i].setAttribute('aria-selected', String(activa));
      botones[i].tabIndex = activa ? 0 : -1;
      t.panel.hidden = !activa;
    });
  }

  // Al abrir: la pestaña de la iniciativa pedida (#/revision?iniciativa=INI-001) o, si no, la
  // primera con pendientes. Al recargar después de una acción, se queda en la que estaba, salvo que
  // ya no exista: entonces, la primera con pendientes, para que nunca quede la pantalla sin panel.
  if (recarga && !pestanas.some((t) => t.id === pestana)) {
    pestana = (pestanas.find((t) => t.id !== 'resueltas' && t.codigos.length) ?? pestanas[0]).id;
  }
  if (!recarga) {
    const buscado = codigo ? String(codigo).toUpperCase() : null;
    const conCodigo = buscado ? pestanas.find((t) => t.codigos.includes(buscado)) : null;
    const conPendientes = pestanas.find((t) => t.id !== 'resueltas' && t.codigos.length);
    pestana = (conCodigo ?? conPendientes ?? pestanas[0]).id;
  }
  const partes = [
    el('h1', { text: 'Respuestas en revisión' }),
    el('p', { class: 'texto-secundario', text: 'Lo que no calzó al procesar un Registro queda aquí, a la vista. Corrige lo que haga falta y resuélvelo con una nota.' }),
    lista, panelRegistro, panelResueltas,
  ];
  if (recarga) {
    mostrarPestana();
    const volvio = repintar(contenedor, ...partes);
    if (!volvio && foco) enfocarSiguiente(foco);
    return;
  }
  pintar(contenedor, ...partes);
  mostrarPestana();
  if (codigo) enfocarIniciativa(pestanas.find((t) => t.id === pestana).panel, codigo);
}

// Tarjetas de un panel, en orden (las respuestas y luego las iniciativas sueltas).
const tarjetasDe = (panel) => [...panel.querySelectorAll('.lista-tarjetas > li > article')];

// Posición de la tarjeta en su panel: para saber cuál queda en su lugar después de resolverla.
function posicion(articulo) {
  const panel = articulo.closest('[role="tabpanel"]');
  return { panel: panel.id, indice: tarjetasDe(panel).indexOf(articulo) };
}

function enfocarSiguiente({ panel, indice }) {
  const contenedor = document.getElementById(panel);
  if (!contenedor) return;
  const tarjetas = tarjetasDe(contenedor);
  enfocar(tarjetas[indice] ?? tarjetas[tarjetas.length - 1] ?? contenedor.querySelector('.vacio'));
}

// Resalta las tarjetas de una iniciativa, lleva la página a la primera y le pasa el foco.
function enfocarIniciativa(panel, codigo) {
  const buscado = String(codigo).toUpperCase();
  if (!/^INI-\d+$/.test(buscado)) return;
  const tarjetas = [...panel.querySelectorAll('[data-iniciativa]')].filter((t) => t.dataset.iniciativa === buscado);
  if (!tarjetas.length) {
    avisar(`${buscado} ya no tiene respuestas pendientes de revisión.`, 'info');
    return;
  }
  for (const t of tarjetas) t.classList.add('tarjeta--enfocada');
  const primera = tarjetas[0];
  primera.setAttribute('tabindex', '-1');
  primera.scrollIntoView({ block: 'start' });
  primera.focus({ preventScroll: true });
  if (tarjetas.length > 1) avisar(`${buscado} tiene ${tarjetas.length} tarjetas en revisión, resaltadas.`, 'info');
}

// Código de la iniciativa que creó la respuesta.
function codigoDe(r) {
  return r.iniciativa?.codigo ?? (r.codigo_iniciativa ? r.codigo_iniciativa.trim().toUpperCase() : null);
}

const textoQuedan = (n) => (n > 0 ? `Quedan ${n}.` : 'No queda ninguna pendiente.');

// Con varios motivos, el principal es el que pide una acción antes que los demás:
// el área, el código. Si ninguno calza, el primero que escribió la base.
const PRIORIDAD = [
  /área|gerencia/i,
  /código/i,
];
function principal(lista) {
  for (const patron of PRIORIDAD) {
    const m = lista.find((x) => patron.test(x));
    if (m) return m;
  }
  return lista[0];
}

// El título de la tarjeta es el motivo principal: lo primero que hay que leer. Si hay más, el
// título dice cuántos y debajo van los demás, uno por línea (sin repetir el del título). El código
// (a la derecha) lleva al registro de la iniciativa a la que pertenece. Después, de qué formulario
// vino y quién lo envió.
function cabecera(textoMotivo, idTitulo, codigo, nivel = 'h2') {
  const lista = motivos(textoMotivo);
  const primero = principal(lista);
  const resto = lista.filter((m) => m !== primero);
  const titulo = !primero
    ? 'Sin motivo registrado'
    : resto.length ? `${primero} · y ${resto.length} ${resto.length === 1 ? 'punto' : 'puntos'} más` : primero;
  return [
    el('div', { class: 'tarjeta__cabecera' },
      el(nivel, { id: idTitulo, class: 'tarjeta__titulo', text: titulo }),
      codigo ? el('a', { class: 'enlace codigo tarjeta__codigo enlace--tactil', href: `#/registros/${codigo}` }, codigo) : null),
    resto.length ? el('ul', { class: 'tarjeta__motivos' }, resto.map((m) => el('li', { text: m }))) : null,
  ];
}

function meta(r) {
  return el('p', { class: 'tarjeta__meta' },
    insignia(FORMULARIOS[r.formulario] ?? r.formulario),
    r.estado_procesamiento === 'pendiente' ? insignia('Sin procesar', 'atencion') : null,
    el('span', { text: formatoFecha(r.enviado_en, { conHora: true }) }),
    el('span', { class: 'tarjeta__correo', text: r.correo || '(sin correo)' }));
}

function respuestasCrudas(r, id) {
  const pares = paresRespuesta(r.formulario, r.respuestas);
  return el('details', { class: 'desplegable', id: `${id}-respuesta` },
    el('summary', { text: 'Ver la respuesta tal como llegó' }),
    // El correo lo escribe la persona en el formulario (no lo verifica Google): se muestra primero.
    el('p', {}, 'Correo que escribió: ', el('strong', { text: r.correo || '(sin correo)' })),
    pares
      ? el('dl', { class: 'datos datos--respuesta' }, pares.flatMap(([p, v]) => [el('dt', { text: p }), el('dd', { class: 'texto-libre', text: v })]))
      : el('pre', { class: 'texto-libre', text: JSON.stringify(r.respuestas, null, 2) }));
}

function loCreado(r) {
  // Sin el código: ya está en la cabecera de la tarjeta.
  if (r.iniciativa) {
    return el('p', {}, 'Creó la iniciativa ', el('strong', { text: r.iniciativa.nombre }));
  }
  if (r.descartado_en) {
    return el('p', {}, el('strong', { text: 'Registro descartado' }), ': no creó ni cambió ninguna iniciativa.');
  }
  return el('p', { class: 'texto-secundario', text: 'No se creó nada a partir de esta respuesta.' });
}

function tarjetaRespuesta(r, cat, recargar, quedan, esAdmin) {
  const id = `r${r.id}`;
  let articulo;
  const recargarAqui = () => recargar({ foco: posicion(articulo) });

  const editable = r.iniciativa;
  const partes = [cabecera(r.motivo_revision, `${id}-titulo`, codigoDe(r)), meta(r), loCreado(r)];
  // Reabierta por el admin: se muestra la resolución anterior y por qué se reabrió.
  if (r.resuelto_en) {
    partes.push(el('div', { class: 'mensaje mensaje--atencion' },
      el('p', { class: 'mensaje__titulo', text: `Reabierta (se había resuelto el ${formatoFecha(r.resuelto_en, { conHora: true })})` }),
      el('p', { class: 'texto-libre', text: r.nota_resolucion || 'Sin nota.' })));
  }
  partes.push(respuestasCrudas(r, id));
  if (editable) {
    partes.push(el('details', { class: 'desplegable', id: `${id}-corregir` },
      el('summary', { text: `Corregir ${editable.codigo}` }),
      formulariosEdicion(editable, cat, { alGuardar: recargarAqui, prefijo: `${id}-ini` })));
  }
  partes.push(resolver(r, id, quedan, () => posicion(articulo), recargar));

  articulo = el('article', {
    class: 'tarjeta tarjeta--revision', id: `tarjeta-${id}`, 'data-iniciativa': codigoDe(r), 'aria-labelledby': `${id}-titulo`,
  }, partes);
  return articulo;
}

// Resolver va plegado: un botón abre la nota en su lugar. Así cada tarjeta muestra primero el
// motivo y lo que llegó, y la cola se recorre rápido.
function resolver(r, id, quedan, dondeEsta, recargar) {
  const abrir = el('button', {
    type: 'button', id: `${id}-abrir`, class: 'boton boton--principal', 'aria-expanded': 'false', 'aria-controls': `${id}-resolver`,
  }, 'Resolver…');
  const reintento = el('button', { type: 'button', id: `${id}-reintentar`, class: 'boton boton--texto' }, 'Volver a procesar');
  const inicio = el('div', { class: 'acciones' }, abrir, reintento);

  const nota = el('textarea', { rows: 3, required: true });
  const marcar = el('button', { type: 'submit', id: `${id}-marcar`, class: 'boton boton--principal' }, 'Marcar como resuelta');
  const cancelar = el('button', { type: 'button', class: 'boton boton--secundario' }, 'Cancelar');
  const formulario = el('form', { class: 'resolver__nota', id: `${id}-resolver`, novalidate: true, hidden: true },
    campo(`${id}-nota`, 'Nota de resolución (obligatoria)', nota, 'Qué se revisó o corrigió. Queda guardada con tu nombre y la fecha; no se puede editar después.'),
    el('div', { class: 'acciones' }, marcar, cancelar));
  const zona = el('div', { class: 'resolver' }, inicio, formulario);

  // Un cambio escrito en "Corregir" pero sin su Guardar no está en la base: se avisa y no se
  // resuelve, para no cerrar la revisión creyendo que se corrigió.
  const avisarSinGuardar = (donde) => {
    const pendientesDeGuardar = sinGuardar(zona.closest('article') ?? zona);
    if (!pendientesDeGuardar.length) return false;
    const detalles = pendientesDeGuardar[0].control.closest('details');
    if (detalles) detalles.open = true;
    errorEn(donde, `Tienes cambios sin guardar en: ${pendientesDeGuardar.map((b) => b.titulo).join(', ')}. `
      + 'Pulsa su botón Guardar (o deshaz el cambio) antes de resolver.');
    pendientesDeGuardar[0].control.focus();
    return true;
  };

  abrir.addEventListener('click', () => {
    errorEn(zona, null);
    if (avisarSinGuardar(zona)) return;
    formulario.hidden = false;
    inicio.hidden = true;
    abrir.setAttribute('aria-expanded', 'true');
    nota.focus();
  });
  cancelar.addEventListener('click', () => {
    formulario.hidden = true;
    inicio.hidden = false;
    abrir.setAttribute('aria-expanded', 'false');
    errorEn(formulario, null);
    abrir.focus();
  });

  reintento.addEventListener('click', async () => {
    errorEn(zona, null);
    // Si ya creó algo, volver a procesar no lo repite ni lo cambia: se dice así, sin llamar a la base.
    const creado = r.iniciativa?.codigo;
    if (creado) {
      avisar(`Esta respuesta ya se procesó y creó ${creado}: volver a procesarla no cambia nada. Corrige lo que falte y resuélvela con una nota.`, 'info');
      return;
    }
    try {
      const estado = await conBoton(reintento, 'Procesando…', async () => {
        await reintentar(r.id);
        return estadoRespuesta(r.id);
      });
      const lista = estado?.estado_procesamiento === 'procesado';
      avisar(lista
        ? `Se volvió a procesar y quedó lista. ${textoQuedan(quedan)}`
        : `Se volvió a procesar y sigue en revisión: ${motivos(estado?.motivo_revision).join(' · ') || 'sin motivo'}.`,
      'info');
      recargar({ foco: dondeEsta() });
    } catch (e) {
      errorEn(zona, mensajeError(e));
    }
  });

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEn(formulario, null);
    if (avisarSinGuardar(formulario)) return;
    // La base no deja resolver un Registro sin área (los demás motivos pueden quedar como llegaron);
    // aquí se avisa antes, con dónde corregirla.
    const delRegistro = r.iniciativa;
    if (r.formulario === 'registro' && delRegistro && !delRegistro.area_id) {
      errorEn(formulario, `Asigna el área de la iniciativa antes de resolver: abre "Corregir ${delRegistro.codigo}" y guarda el área. Si no está en la lista, usa "Agregar un área nueva".`);
      return;
    }
    if (!nota.value.trim()) {
      errorCampo(nota, 'Escribe una nota que explique cómo se resolvió.');
      return;
    }
    try {
      await conBoton(marcar, 'Guardando…', () => resolverRevision(r.id, nota.value));
      avisar(`Respuesta resuelta. ${textoQuedan(quedan)}`);
      recargar({ foco: dondeEsta() });
    } catch (err) {
      errorEn(formulario, mensajeError(err));
    }
  });
  return zona;
}

function tarjetaIniciativa(ini, recargar, quedan) {
  const id = `i${ini.id}`;
  let articulo;
  const boton = el('button', { type: 'button', id: `${id}-quitar`, class: 'boton boton--secundario' }, 'Quitar marca de revisión');
  const acciones = el('div', { class: 'acciones' },
    el('a', { class: 'boton boton--principal', href: `#/registros/${ini.codigo}` }, 'Corregir en su registro'),
    boton);
  const zona = el('div', { class: 'resolver' }, acciones);
  boton.addEventListener('click', async () => {
    if (!window.confirm(`¿Quitar la marca de revisión de ${ini.codigo}? Esta acción no guarda nota ni autor.`)) return;
    errorEn(zona, null);
    try {
      await conBoton(boton, 'Quitando…', () => actualizarIniciativa(ini.id, { requiere_revision: false }));
      avisar(`${ini.codigo} ya no está en revisión. ${textoQuedan(quedan)}`);
      recargar({ foco: posicion(articulo) });
    } catch (e) {
      errorEn(zona, mensajeError(e));
    }
  });
  articulo = el('article', {
    class: 'tarjeta tarjeta--revision', id: `tarjeta-${id}`, 'data-iniciativa': ini.codigo, 'aria-labelledby': `${id}-titulo`,
  },
    cabecera(ini.motivo_revision, `${id}-titulo`, ini.codigo, 'h3'),
    el('p', { class: 'tarjeta__meta' },
      el('strong', { text: ini.nombre }),
      el('span', { text: ini.participante.nombre }),
      ini.activa ? null : insignia('Desactivada', 'apagada')),
    zona);
  return articulo;
}

function tarjetaResuelta(r, quien, esAdmin, recargar) {
  const id = `re${r.id}`;
  let articulo;
  articulo = el('article', { class: 'tarjeta tarjeta--revision', id: `tarjeta-${id}`, 'aria-labelledby': `${id}-titulo` },
    cabecera(r.motivo_revision, `${id}-titulo`, codigoDe(r)),
    meta(r),
    loCreado(r),
    el('dl', { class: 'datos' },
      el('dt', { text: 'Resuelta' }), el('dd', { text: formatoFecha(r.resuelto_en, { conHora: true }) }),
      el('dt', { text: 'Por' }), el('dd', { text: quien }),
      el('dt', { text: 'Nota' }), el('dd', { class: 'texto-libre', text: r.nota_resolucion || '—' })),
    respuestasCrudas(r, id),
    esAdmin ? reabrir(r, id, () => recargar({ foco: posicion(articulo) })) : reabrirSoloAdmin(id));
  return articulo;
}

// Facilitador: la opción se ve, desactivada, para que sepa que existe y a quién pedirla.
function reabrirSoloAdmin(id) {
  const ayuda = `${id}-solo-admin`;
  return el('div', { class: 'acciones acciones--nota' },
    el('button', { type: 'button', class: 'boton boton--secundario boton--no-disponible', disabled: true, 'aria-describedby': ayuda },
      'Reabrir (resuelta por error)'),
    el('p', { class: 'campo__ayuda', id: ayuda, text: 'Solo el administrador puede reabrirla. Si se resolvió por error, avísale.' }));
}

// Solo el admin: devuelve a Pendientes una respuesta resuelta por error, con nota obligatoria.
// Quién y cuándo la resolvió, y su nota, se conservan.
function reabrir(r, id, alReabrir) {
  const nota = el('textarea', { rows: 2, required: true });
  const boton = el('button', { type: 'submit', id: `${id}-reabrir`, class: 'boton boton--secundario' }, 'Reabrir');
  const formulario = el('form', { novalidate: true },
    campo(`${id}-nota`, 'Por qué se reabre (obligatorio)', nota, 'Vuelve a Pendientes. Se conservan quién la resolvió, cuándo y su nota.'),
    el('div', { class: 'acciones' }, boton));
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEn(formulario, null);
    if (!nota.value.trim()) {
      errorCampo(nota, 'Escribe por qué se reabre.');
      return;
    }
    if (!window.confirm('¿Reabrir esta respuesta? Vuelve a Pendientes para revisarla otra vez.')) return;
    try {
      await conBoton(boton, 'Reabriendo…', () => reabrirRevision(r.id, nota.value));
      avisar('Respuesta reabierta: está otra vez en Pendientes.');
      alReabrir();
    } catch (err) {
      errorEn(formulario, mensajeError(err));
    }
  });
  return el('details', { class: 'desplegable', id: `${id}-reabrir-zona` },
    el('summary', { text: 'Reabrir (resuelta por error)' }),
    formulario);
}
