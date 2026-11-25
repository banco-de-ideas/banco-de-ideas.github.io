import { el, pintar, insignia, formatoFecha, mensajeError, normalizar, campo, selector, rolesDeTabla, turnoActual, vigente } from '../ui.js?v=202611250528';
import { cargarCatalogos, listarIniciativas, cambiosEstadoDatos } from '../datos.js?v=202611250528';
import {
  textoHerramienta, textoTipo, opcionesArea, motivos, SEMAFOROS,
  unidadPorClasificar,
} from '../etiquetas.js?v=202611250528';
import { pastillaSemaforo, notaSemaforo } from './semaforo.js?v=202611250528';

// Filtros de la lista: se conservan mientras dura la sesión en esta pestaña (al volver del detalle).
const FILTROS_INICIALES = { texto: '', empresa: '', area: '', herramienta: '', tipo: '', estado: '', atencion: '', datos: '', desactivadas: false, archivo: '' };
const filtros = { ...FILTROS_INICIALES };

// Filtros que viajan en la dirección (#/registros?atencion=area). La búsqueda por texto no:
// puede llevar el nombre o el correo de una persona.
const EN_DIRECCION = ['empresa', 'area', 'herramienta', 'tipo', 'estado', 'atencion', 'datos', 'desactivadas', 'archivo'];
// Filtros de casilla: en la dirección van como "=1".
const CASILLAS = ['desactivadas'];

// Al cerrar sesión: la búsqueda puede tener el nombre o el correo de una persona.
export function olvidarFiltros() {
  Object.assign(filtros, FILTROS_INICIALES);
}

// Si la dirección trae filtros distintos de los actuales (un atajo de Inicio, un enlace
// compartido), mandan ellos y la búsqueda por texto se limpia. Si son los mismos (volver con
// "Atrás"), todo queda como estaba. Sin filtros en la dirección (se llegó desde el menú u otra
// sección), la lista vuelve completa; solo al regresar de un detalle se conserva lo que había.
function leerDireccion(consulta, desdeDetalle) {
  if (!consulta || !EN_DIRECCION.some((c) => consulta.has(c))) {
    if (!desdeDetalle) Object.assign(filtros, FILTROS_INICIALES);
    return;
  }
  const pedidos = {};
  for (const clave of EN_DIRECCION) {
    pedidos[clave] = CASILLAS.includes(clave) ? consulta.get(clave) === '1' : (consulta.get(clave) ?? '');
  }
  if (EN_DIRECCION.every((c) => filtros[c] === pedidos[c])) return;
  Object.assign(filtros, FILTROS_INICIALES, pedidos);
}

// Deja la dirección igual a los filtros elegidos, sin crear una entrada nueva en el historial:
// "Atrás" desde el detalle vuelve a la lista tal como estaba.
function escribirDireccion() {
  const consulta = new URLSearchParams();
  for (const clave of EN_DIRECCION) {
    if (CASILLAS.includes(clave)) { if (filtros[clave]) consulta.set(clave, '1'); }
    else if (filtros[clave]) consulta.set(clave, filtros[clave]);
  }
  const texto = consulta.toString();
  history.replaceState(null, '', `#/registros${texto ? `?${texto}` : ''}`);
}

export async function vistaRegistros(contenedor, perfil, consulta, { desdeDetalle = false } = {}) {
  // Solo admin y facilitador ven el enlace para resolver (es comodidad: la base decide).
  const operador = perfil?.rol === 'admin' || perfil?.rol === 'facilitador';
  const turno = turnoActual();
  leerDireccion(consulta, desdeDetalle);
  escribirDireccion(); // la dirección siempre muestra los filtros que están puestos
  pintar(contenedor, el('h1', { text: 'Registros' }), el('p', { class: 'cargando', text: 'Cargando iniciativas…' }));
  let cat; let iniciativas; let cambios;
  try {
    // El semáforo de uso de datos (y sus cambios a mano) solo lo ven admin y facilitador.
    [cat, iniciativas, cambios] = await Promise.all([cargarCatalogos(), listarIniciativas({ conCoordinacion: true }),
      operador ? cambiosEstadoDatos().catch(() => []) : []]);
  } catch (e) {
    if (!vigente(turno)) return;
    pintar(contenedor, el('h1', { text: 'Registros' }), el('p', { class: 'mensaje mensaje--error', role: 'alert', text: mensajeError(e) }));
    return;
  }
  if (!vigente(turno)) return;

  // Cada fila se arma una sola vez, con lo que se necesita para filtrarla; filtrar solo la oculta o la muestra.
  const porId = new Map(cat.areas.map((a) => [a.id, a]));
  // Último cambio de color de cada iniciativa, a mano o automático (llegan del más nuevo al más viejo).
  const ultimoCambio = new Map();
  for (const c of cambios) if (!ultimoCambio.has(c.iniciativa_id)) ultimoCambio.set(c.iniciativa_id, c);
  const filas = iniciativas.map((ini) => {
    const areaAsignada = porId.has(ini.area_id);
    return {
      ini,
      areaAsignada,
      porClasificar: unidadPorClasificar(ini, porId),
      areas: areaAsignada ? [String(ini.area_id)] : [],
      busqueda: [ini.codigo, ini.nombre, ini.participante.nombre, ini.participante.correo, coordinaDe(ini)?.nombre, coordinaDe(ini)?.correo, ini.empresa_marca].map(normalizar).join(' '),
      fila: fila(ini, porId, operador, areaAsignada, ultimoCambio.get(ini.id)),
    };
  });

  const conteo = el('p', { class: 'conteo', role: 'status', 'aria-live': 'polite' });
  const vacio = el('p', { class: 'vacio', hidden: true, text: 'No hay iniciativas para mostrar con estos filtros.' });
  const enArchivo = () => filtros.archivo === 'archivadas';
  const total = () => iniciativas.filter((i) => Boolean(i.archivada) === enArchivo() && (filtros.desactivadas || i.activa)).length;

  // Activas / Archivadas: las archivadas no cuentan en Inicio ni Progreso; aquí se consultan.
  const nArchivadas = iniciativas.filter((i) => i.archivada && i.activa).length;
  const pestanas = [['', 'Activas'], ['archivadas', `Archivadas (${nArchivadas})`]].map(([valor, texto]) => el('button', {
    type: 'button', role: 'tab', class: 'pestana', 'data-archivo': valor, 'aria-controls': 'lista-registros',
    onclick: () => { filtros.archivo = valor; escribirDireccion(); actualizar(); },
  }, texto));
  const listaPestanas = el('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Iniciativas activas o archivadas' }, pestanas);
  listaPestanas.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const otra = pestanas.find((b) => b.dataset.archivo !== filtros.archivo);
    otra.click();
    otra.focus();
  });

  const actualizar = () => {
    const buscado = normalizar(filtros.texto);
    let visibles = 0;
    for (const f of filas) {
      const ve = cumple(f, buscado, operador);
      f.fila.hidden = !ve;
      if (ve) visibles += 1;
    }
    vacio.hidden = visibles > 0;
    for (const b of contenedor.querySelectorAll('.conteo-semaforo button')) {
      b.setAttribute('aria-pressed', String(b.classList.contains(`semaforo--${filtros.datos}`)));
    }
    for (const b of pestanas) b.setAttribute('aria-selected', String(b.dataset.archivo === filtros.archivo));
    for (const b of pestanas) b.tabIndex = b.dataset.archivo === filtros.archivo ? 0 : -1;
    const n = total();
    conteo.textContent = visibles === n
      ? `${n} ${n === 1 ? 'iniciativa' : 'iniciativas'}`
      : `Mostrando ${visibles} de ${n} iniciativas`;
  };

  pintar(contenedor,
    el('div', { class: 'encabezado' }, el('h1', { text: 'Registros' }),
      operador ? el('a', { class: 'boton boton--principal', href: '#/registrar' }, 'Registrar iniciativa') : null),
    listaPestanas,
    barraFiltros(cat, iniciativas, actualizar, turno, operador),
    conteo,
    operador ? conteoSemaforo(iniciativas) : null,
    el('div', { class: 'tabla-contenedor', id: 'lista-registros', role: 'tabpanel' },
      rolesDeTabla(el('table', { class: 'tabla tabla--registros' },
        el('caption', { class: 'solo-lectores', text: 'Iniciativas registradas' }),
        el('thead', {}, el('tr', {},
          columnas(operador).map((t) => el('th', { scope: 'col', text: t })))),
        el('tbody', {}, filas.map((f) => f.fila))))),
    vacio,
  );
  actualizar();
}

const COLUMNAS = ['Código', 'Iniciativa', 'Persona', 'Área', 'Herramienta y estado', 'Tipo', 'Uso de datos', 'Registrada'];
// "Uso de datos" (el semáforo) solo para admin y facilitador; sin "Confidencial" para nadie.
const columnas = (operador) => (operador ? COLUMNAS : COLUMNAS.filter((_, i) => i !== 6));

// Cuántas iniciativas activas hay de cada color.
function conteoSemaforo(iniciativas) {
  const activas = iniciativas.filter((i) => i.activa && !i.archivada);
  const partes = SEMAFOROS.map((s) => [s, activas.filter((i) => i.estado_datos === s.valor).length]).filter(([, n]) => n);
  if (!partes.length) return null;
  const filtrar = (valor) => {
    const control = document.getElementById('f-datos');
    if (!control) return;
    control.value = control.value === valor ? '' : valor;
    control.dispatchEvent(new Event('change'));
  };
  return el('div', { class: 'conteo-semaforo', role: 'group', 'aria-label': 'Iniciativas activas por color de uso de datos; elige uno para filtrar' },
    partes.map(([s, n]) => el('button', {
      type: 'button', class: `semaforo semaforo--${s.valor} semaforo--boton`,
      'aria-pressed': String(filtros.datos === s.valor), onclick: () => filtrar(s.valor),
    }, `${s.texto}: ${n}`)));
}

function cumple({ ini, porClasificar, areas, busqueda }, buscado, operador) {
  if (Boolean(ini.archivada) !== (filtros.archivo === 'archivadas')) return false;
  if (!filtros.desactivadas && !ini.activa) return false;
  if (filtros.atencion === 'revision' && !ini.requiere_revision) return false;
  if (filtros.atencion === 'area' && !porClasificar) return false;
  if (filtros.empresa && String(ini.participante.empresa_id) !== filtros.empresa) return false;
  // La unidad elegida incluye las que dependen de ella, en cualquier nivel (así llega desde Progreso).
  if (filtros.area && !areas.includes(filtros.area)) return false;
  if (filtros.herramienta === 'sin' ? ini.track_id : filtros.herramienta && String(ini.track_id) !== filtros.herramienta) return false;
  if (filtros.tipo === 'por-definir' && (ini.tipo_iniciativa_id || ini.tipo_detalle)) return false;
  if (filtros.tipo === 'otro' && (ini.tipo_iniciativa_id || !ini.tipo_detalle)) return false;
  if (/^\d+$/.test(filtros.tipo) && String(ini.tipo_iniciativa_id) !== filtros.tipo) return false;
  // Por nombre: Idea, Prototipo y Producto son los mismos en las dos herramientas.
  if (filtros.estado && ini.estado?.nombre !== filtros.estado) return false;
  if (operador && filtros.datos && (ini.estado_datos ?? 'sin') !== filtros.datos) return false;
  if (buscado && !busqueda.includes(buscado)) return false;
  return true;
}

function barraFiltros(cat, iniciativas, actualizar, turno, operador) {
  const texto = el('input', { type: 'search', value: filtros.texto, placeholder: 'Código, iniciativa o persona' });
  const empresa = selector([{ valor: '', texto: 'Todas' }, ...cat.empresas.map((e) => ({ valor: e.id, texto: e.nombre }))], filtros.empresa);
  // Áreas activas en orden alfabético (agrupadas por empresa, si hay varias).
  // Con una empresa elegida, solo sus áreas.
  const nombreEmpresa = new Map(cat.empresas.map((e) => [e.id, e.nombre]));
  const opcionesDeArea = () => [{ valor: '', texto: 'Todas' },
    ...opcionesArea(cat.areas.filter((a) => a.activo && nombreEmpresa.has(a.empresa_id) && (!filtros.empresa || String(a.empresa_id) === filtros.empresa)),
      (a) => (cat.empresas.length > 1 && !filtros.empresa ? nombreEmpresa.get(a.empresa_id) : null))];
  const area = selector(opcionesDeArea(), filtros.area);
  const herramienta = selector([
    { valor: '', texto: 'Todas' },
    ...cat.tracks.map((t) => ({ valor: t.id, texto: t.nombre })),
    { valor: 'sin', texto: 'Sin herramienta asignada' },
  ], filtros.herramienta);
  const tipo = selector([
    { valor: '', texto: 'Todos' },
    ...cat.tipos.map((t) => ({ valor: t.id, texto: t.nombre })),
    { valor: 'otro', texto: 'Otro (escrito por la persona)' },
    // El formulario siempre pide el tipo: "Por definir" solo aparece si alguna quedó sin él.
    ...(iniciativas.some((i) => !i.tipo_iniciativa_id && !i.tipo_detalle) || filtros.tipo === 'por-definir'
      ? [{ valor: 'por-definir', texto: 'Por definir' }] : []),
  ], filtros.tipo);
  // Cada estado una sola vez, en su orden (el catálogo los repite por herramienta).
  const nombresEstado = [...new Map(cat.estados.filter((e) => e.activo)
    .sort((a, b) => a.orden - b.orden).map((e) => [e.nombre, e.nombre])).keys()];
  const estado = selector([
    { valor: '', texto: 'Todos' },
    ...nombresEstado.map((n) => ({ valor: n, texto: n })),
  ], filtros.estado);
  const atencion = selector([
    { valor: '', texto: 'Todas' },
    { valor: 'revision', texto: 'En revisión' },
    { valor: 'area', texto: 'Área por clasificar' },
  ], filtros.atencion);
  const datos = selector([
    { valor: '', texto: 'Todos' },
    ...SEMAFOROS,
    { valor: 'sin', texto: 'Sin color (formulario anterior)' },
  ], filtros.datos);
  const desactivadas = el('input', { type: 'checkbox', id: 'f-desactivadas', checked: filtros.desactivadas });

  // En el teléfono los filtros se pliegan detrás de este botón (solo la búsqueda queda a la vista).
  const alternar = el('button', {
    type: 'button', class: 'boton boton--secundario filtros__alternar', 'aria-expanded': 'false', 'aria-controls': 'filtros',
  });
  const activos = () => ['empresa', 'area', 'herramienta', 'tipo', 'estado', 'atencion', 'datos'].filter((c) => filtros[c]).length + CASILLAS.filter((c) => filtros[c]).length;
  const rotular = () => {
    const n = activos();
    alternar.textContent = n ? `Filtros (${n} ${n === 1 ? 'activo' : 'activos'})` : 'Filtros';
  };

  const leer = () => {
    Object.assign(filtros, {
      texto: texto.value, empresa: empresa.value, area: area.value, herramienta: herramienta.value, tipo: tipo.value,
      estado: estado.value, atencion: atencion.value, datos: operador ? datos.value : '', desactivadas: desactivadas.checked,
    });
    escribirDireccion();
    rotular();
    actualizar();
  };
  for (const control of [area, herramienta, tipo, estado, atencion, datos, desactivadas]) control.addEventListener('change', leer);
  // Otra empresa: los demás filtros se limpian y el área ofrece solo las de esa
  // empresa. La búsqueda por texto se queda: es lo que la persona está buscando.
  empresa.addEventListener('change', () => {
    herramienta.value = ''; tipo.value = ''; estado.value = ''; atencion.value = ''; datos.value = '';
    desactivadas.checked = false;
    filtros.empresa = empresa.value;
    area.replaceChildren(...selector(opcionesDeArea(), '').childNodes);
    area.value = '';
    leer();
  });
  // Al escribir se espera una pausa breve: no se filtra (ni se anuncia el conteo) en cada tecla.
  // Si en esa pausa ya se abrió un detalle, no se toca la dirección.
  let espera;
  texto.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (vigente(turno)) leer(); }, 200);
  });

  const limpiar = el('button', {
    type: 'button', class: 'boton boton--secundario',
    onclick: () => {
      texto.value = ''; empresa.value = ''; herramienta.value = ''; tipo.value = ''; estado.value = ''; atencion.value = ''; datos.value = '';
      desactivadas.checked = false;
      filtros.empresa = '';
      area.replaceChildren(...selector(opcionesDeArea(), '').childNodes);
      area.value = '';
      leer();
    },
  }, 'Limpiar filtros');

  rotular();
  const formulario = el('form', { class: operador ? 'filtros filtros--con-datos' : 'filtros', id: 'filtros', role: 'search', 'aria-label': 'Filtrar iniciativas', onsubmit: (e) => e.preventDefault() },
    campo('f-texto', 'Buscar', texto),
    alternar,
    cat.empresas.length > 1 ? campo('f-empresa', 'Empresa', empresa) : null,
    campo('f-area', 'Área', area),
    campo('f-herramienta', 'Herramienta', herramienta),
    campo('f-tipo', 'Tipo', tipo),
    campo('f-estado', 'Estado', estado),
    campo('f-atencion', 'Necesita atención', atencion),
    operador ? campo('f-datos', 'Uso de datos', datos) : null,
    el('div', { class: 'filtros__casillas' },
      el('div', { class: 'casilla' }, desactivadas, el('label', { for: 'f-desactivadas', text: 'Mostrar desactivadas' })),
      limpiar),
  );
  alternar.addEventListener('click', () => {
    const abrir = !formulario.classList.contains('filtros--abiertos');
    formulario.classList.toggle('filtros--abiertos', abrir);
    alternar.setAttribute('aria-expanded', String(abrir));
  });
  return formulario;
}

// Quien coordina (el primero de "Personas de la iniciativa"), o null si no se sabe.
function coordinaDe(ini) {
  return ini.integrantes?.find((g) => g.activo && g.rol === 'coordinador')?.participante ?? null;
}

function fila(ini, porId, operador, areaAsignada, cambio) {
  const p = ini.participante;
  // Quien coordina; si no se pudo saber, quien llenó el primer Registro.
  const c = coordinaDe(ini) ?? p;
  const detalle = `#/registros/${ini.codigo}`;
  const tr = el('tr', { class: ini.activa ? 'fila--enlace' : 'fila--enlace fila--desactivada' },
    el('td', { 'data-etiqueta': COLUMNAS[0] },
      el('a', { class: 'enlace codigo enlace--tactil', href: detalle }, ini.codigo),
      ini.activa ? null : insignia('Desactivada', 'apagada')),
    el('td', { 'data-etiqueta': COLUMNAS[1] },
      el('span', { class: 'celda__principal', text: ini.nombre }),
      ini.requiere_revision
        ? el('span', { class: 'celda__nota' }, insignia('En revisión', 'atencion'), ` ${motivos(ini.motivo_revision).join(' · ')}`,
            operador
              ? [' ', el('a', { class: 'enlace enlace--tactil', href: `#/revision?iniciativa=${ini.codigo}`, 'aria-label': `Resolver la revisión de ${ini.codigo}` }, 'Resolver')]
              : null)
        : null),
    el('td', { 'data-etiqueta': COLUMNAS[2] },
      el('span', { text: c.nombre }), el('span', { class: 'celda__nota celda__correo', text: c.correo }),
      c.id !== p.id ? el('span', { class: 'celda__nota', text: `Registró: ${p.nombre}` }) : null),
    // El área; si eligió "Mi área no aparece", "Por clasificar" con lo que escribió.
    el('td', { 'data-etiqueta': COLUMNAS[3] }, areaAsignada
      ? el('span', { text: porId.get(ini.area_id).nombre })
      : [insignia('Por clasificar', 'atencion'), el('span', { class: 'celda__nota', text: ini.area_declarada || '(no escribió su área)' })]),
    el('td', { 'data-etiqueta': COLUMNAS[4] },
      ini.track
        ? [el('span', { text: ini.track.nombre }), el('span', { class: 'celda__nota', text: ini.estado?.nombre ?? '' })]
        : insignia(textoHerramienta(ini), 'apagada')),
    el('td', { 'data-etiqueta': COLUMNAS[5] }, ini.tipo ? ini.tipo.nombre : insignia(textoTipo(ini), 'apagada')),
    // Solo cuenta el semáforo: los Registros anteriores al v3 quedan "Sin color".
    operador ? el('td', { 'data-etiqueta': COLUMNAS[6] }, pastillaSemaforo(ini.estado_datos), notaSemaforo(ini, cambio)) : null,
    el('td', { 'data-etiqueta': COLUMNAS[7], text: formatoFecha(ini.creado_en) }),
  );
  // Toda la fila lleva al detalle. Con teclado se usa el enlace del código; un clic sobre
  // otro enlace o al seleccionar texto (para copiar un correo) no navega.
  tr.addEventListener('click', (e) => {
    if (e.target.closest('a, button') || String(window.getSelection())) return;
    location.hash = detalle;
  });
  return tr;
}
