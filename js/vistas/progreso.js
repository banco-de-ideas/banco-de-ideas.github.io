import { el, pintar, repintar, mensajeError, rolesDeTabla, turnoActual, vigente, campo, selector } from '../ui.js?v=202611250528';
import { cargarCatalogos, listarIniciativas } from '../datos.js?v=202611250528';
import { opcionesArea } from '../etiquetas.js?v=202611250528';

// Progreso, el tablero del observador: cuántas iniciativas hay y qué tan maduras llegan (Idea,
// Prototipo, Producto), por herramienta y por área. Es un banco permanente: sin fechas ni
// calendario. Lo que cada quien ve lo decide la base: un observador con áreas asignadas solo
// recibe esas áreas. El equipo lo abre desde Inicio con el interruptor "Tablero observador".

// Filtros: se conservan mientras dura la sesión en esta pestaña.
const filtros = { empresa: '', area: '', herramienta: '' };
export function olvidarFiltrosProgreso() {
  Object.assign(filtros, { empresa: '', area: '', herramienta: '' });
}

// Bajo el título de cada sección, una línea que dice cómo leerla y, solo si hace falta, una
// leyenda con lo que no se deduce mirando el tablero (menos carga para quien llega).
const ayuda = (texto, leyenda = null) => [
  el('p', { class: 'bloque__ayuda', text: texto }),
  leyenda ? el('p', { class: 'claves' }, leyenda) : null,
];

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const porcentaje = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// Interruptor de Inicio ↔ tablero, para quien no es observador (el observador entra directo al tablero).
export function interruptorTablero(activo) {
  return el('button', {
    type: 'button', role: 'switch', class: 'interruptor', 'aria-checked': String(activo),
    onclick: () => { location.hash = activo ? '#/' : '#/progreso'; },
  }, el('span', { class: 'interruptor__pista', 'aria-hidden': 'true' }, el('span', { class: 'interruptor__perilla' })),
  'Tablero observador');
}

export async function vistaProgreso(contenedor, perfil) {
  const turno = turnoActual();
  const observador = perfil.rol === 'observador';
  const encabezado = () => el('div', { class: 'encabezado' },
    el('h1', { text: 'Progreso' }),
    observador ? null : interruptorTablero(true));
  pintar(contenedor, encabezado(), el('p', { class: 'cargando', text: 'Cargando…' }));
  let cat; let iniciativas;
  try {
    [cat, iniciativas] = await Promise.all([cargarCatalogos(), listarIniciativas()]);
  } catch (e) {
    if (!vigente(turno)) return;
    pintar(contenedor, encabezado(), el('p', { class: 'mensaje mensaje--error', role: 'alert', text: mensajeError(e) }));
    return;
  }
  if (!vigente(turno)) return;

  const area = new Map(cat.areas.map((a) => [a.id, a]));
  // Los estados por nombre, en orden (Idea, Prototipo, Producto): son los mismos para las dos herramientas.
  const nombresEstado = [...new Map(cat.estados.filter((e) => e.activo).sort((a, b) => a.orden - b.orden)
    .map((e) => [e.nombre, e])).keys()];

  // cadena: su área (un solo nivel; vacía si está por clasificar). unidades: para filtrar.
  const todas = iniciativas.filter((i) => i.activa && !i.archivada)
    .map((ini) => ({ ini, cadena: area.has(ini.area_id) ? [area.get(ini.area_id)] : [],
      unidades: area.has(ini.area_id) ? [String(ini.area_id)] : [] }));

  const empresas = cat.empresas.filter((e) => todas.some((x) => x.ini.participante.empresa_id === e.id));
  // Un filtro que ya no tiene iniciativas (la empresa o el área quedaron sin ninguna desde la
  // última visita) no aparece en su lista y no se podría quitar: se limpia.
  const conIniciativas = new Set(todas.flatMap(({ unidades }) => unidades));
  if (filtros.empresa && !empresas.some((e) => String(e.id) === filtros.empresa)) filtros.empresa = '';
  if (filtros.area && !conIniciativas.has(filtros.area)) filtros.area = '';

  // Al cambiar un filtro se vuelve a dibujar con los datos ya cargados, sin volver arriba.
  const dibujar = (primera) => {
    const enFiltro = todas.filter(({ ini, unidades }) => {
      if (filtros.empresa && String(ini.participante.empresa_id) !== filtros.empresa) return false;
      if (filtros.area && !unidades.includes(filtros.area)) return false;
      if (filtros.herramienta && String(ini.track_id) !== filtros.herramienta) return false;
      return true;
    });
    (primera ? pintar : repintar)(contenedor,
      encabezado(),
      el('p', { class: 'texto-secundario', text: alcance(perfil, cat, empresas) }),
      barraFiltros(cat, empresas, todas, () => dibujar(false)),
      todas.length === 0
        ? el('p', { class: 'vacio', text: 'Todavía no hay iniciativas activas para mostrar.' })
        : enFiltro.length === 0
          ? el('p', { class: 'vacio', text: 'No hay iniciativas con estos filtros.' })
          : [
              resumen(enFiltro, nombresEstado),
              etapas(enFiltro, cat),
              porArea(enFiltro, cat, perfil, empresas.length > 1 && !filtros.empresa, nombresEstado),
            ],
    );
  };
  dibujar(true);
}

// Qué ve quien mira, en una línea.
function alcance(perfil, cat, empresas) {
  const nombres = (cat.empresas.length ? cat.empresas : empresas).map((e) => e.nombre).join(', ');
  const propias = (perfil.areas ?? []).map((id) => cat.areas.find((a) => a.id === id)).filter(Boolean);
  if (propias.length && perfil.rol === 'observador') {
    const empresa = (a) => cat.empresas.find((e) => e.id === a.empresa_id)?.nombre;
    return `Ves las iniciativas de ${propias.map((a) => `${a.nombre} (${empresa(a)})`).join(', ')}.`;
  }
  if (perfil.rol !== 'observador') return `Lo que ve un observador de ${nombres || 'tus empresas'}. Uno con áreas asignadas ve solo las suyas.`;
  return nombres ? `Iniciativas activas de ${nombres}.` : 'Iniciativas activas.';
}

function barraFiltros(cat, empresas, todas, alCambiar) {
  // Solo unidades con iniciativas a la vista (propias o de las que dependen de ellas), en árbol:
  // cada dirección es un grupo y dentro va el camino desde ella.
  const conIniciativas = new Set(todas.flatMap(({ cadena }) => cadena.map((a) => a.id)));
  const nombreEmpresa = new Map(cat.empresas.map((e) => [e.id, e.nombre]));
  const areas = cat.areas
    .filter((a) => conIniciativas.has(a.id) && (!filtros.empresa || String(a.empresa_id) === filtros.empresa));
  const varias = empresas.length > 1;

  const empresa = selector([{ valor: '', texto: 'Todas' }, ...empresas.map((e) => ({ valor: e.id, texto: e.nombre }))], filtros.empresa);
  const area = selector([{ valor: '', texto: 'Todas' },
    ...opcionesArea(areas, (a) => (varias && !filtros.empresa ? nombreEmpresa.get(a.empresa_id) : null))], filtros.area);
  const herramienta = selector([{ valor: '', texto: 'Todas' }, ...cat.tracks.map((t) => ({ valor: t.id, texto: t.nombre }))], filtros.herramienta);
  const leer = () => {
    // Otra empresa: el área elegida puede no ser de ella.
    if (empresa.value !== filtros.empresa) area.value = '';
    Object.assign(filtros, { empresa: empresa.value, area: area.value, herramienta: herramienta.value });
    alCambiar();
  };
  for (const control of [empresa, area, herramienta]) control.addEventListener('change', leer);
  return el('form', { class: 'filtros filtros--simples', role: 'search', 'aria-label': 'Filtrar el progreso', onsubmit: (e) => e.preventDefault() },
    varias ? campo('p-empresa', 'Empresa', empresa) : null,
    areas.length > 1 ? campo('p-area', 'Área', area) : null,
    campo('p-herramienta', 'Herramienta', herramienta));
}

// Cifras: cuántas iniciativas activas y cuántas hay en cada estado. El color va en el número.
function resumen(lista, nombresEstado) {
  const n = lista.length;
  const cifra = (numero, color, texto, detalle) => el('li', { class: 'cifra' },
    el('span', { class: `cifra__numero cifra__numero--${color}`, text: numero }),
    el('span', { class: 'cifra__texto', text: texto }),
    el('span', { class: 'cifra__detalle', text: detalle }));
  const colores = ['apagada', 'regular', 'bien'];
  return el('section', { class: 'bloque bloque--primero', 'aria-labelledby': 'resumen-titulo' },
    el('h2', { id: 'resumen-titulo', class: 'solo-lectores', text: 'Resumen' }),
    el('ul', { class: 'cifras' },
      cifra(String(n), 'marca', n === 1 ? 'iniciativa activa' : 'iniciativas activas',
        plural(lista.filter((x) => x.ini.track_id).length, 'con herramienta', 'con herramienta')),
      nombresEstado.map((nombre, i) => {
        const k = lista.filter((x) => x.ini.estado?.nombre === nombre).length;
        return cifra(String(k), colores[Math.min(i, colores.length - 1)], `en ${nombre}`, `${porcentaje(k, n)} % del total`);
      })));
}

// Tono de un estado en la escala de etapas: gris (Idea) y verdes cada vez más oscuros hasta
// Producto. Los estados se reparten sobre los 6 tonos.
function tono(i, total) {
  return `var(--etapa-${total > 1 ? Math.round((i / (total - 1)) * 5) : 5})`;
}

// Estados de un track para dibujarlo: los activos, más uno inactivo si alguna iniciativa quedó en él.
const estadosParaVer = (cat, trackId, de) => cat.estados
  .filter((e) => e.track_id === trackId && (e.activo || de.some((x) => x.ini.estado_id === e.id)))
  .sort((a, b) => a.orden - b.orden);

// Etapa por herramienta: los estados propios de cada track, en orden, con cuántas hay en cada uno.
function etapas(lista, cat) {
  const sinHerramienta = lista.filter((x) => !x.ini.track_id).length;
  const filas = cat.tracks.map((t) => ({ t, de: lista.filter((x) => x.ini.track_id === t.id) })).filter((f) => f.de.length);
  return el('section', { class: 'bloque bloque--tablero', 'aria-labelledby': 'etapas-titulo' },
    el('h2', { id: 'etapas-titulo', text: 'Estado por herramienta' }),
    ayuda('Qué tan madura está cada iniciativa: Idea, Prototipo o Producto.'),
    el('div', { class: 'tarjeta progreso__tarjeta' },
      filas.map(({ t, de }) => {
        const estados = estadosParaVer(cat, t.id, de);
        const pasos = estados.map((e, i) => ({ e, n: de.filter((x) => x.ini.estado_id === e.id).length, color: tono(i, estados.length) }));
        return el('div', { class: 'etapa' },
          el('p', { class: 'etapa__titulo' }, el('strong', { text: t.nombre }), ` · ${plural(de.length, 'iniciativa', 'iniciativas')}`),
          el('div', { class: 'barra-fases', 'aria-hidden': 'true' },
            pasos.filter((p) => p.n).map((p) => {
              const parte = el('span', { class: 'barra-fases__parte', title: `${p.e.nombre}: ${p.n}` });
              parte.style.flexGrow = String(p.n);
              parte.style.background = p.color;
              return parte;
            })),
          el('ol', { class: 'leyenda' }, pasos.map((p) => {
            const muestra = el('span', { class: 'leyenda__muestra', 'aria-hidden': 'true' });
            muestra.style.background = p.color;
            return el('li', { class: `leyenda__item${p.n ? '' : ' leyenda__item--vacio'}` },
              muestra, `${p.e.nombre} `, el('strong', { text: String(p.n) }));
          })));
      }),
      sinHerramienta
        ? el('p', { class: 'nota', text: `${plural(sinHerramienta, 'iniciativa', 'iniciativas')} sin herramienta asignada: todavía no ${sinHerramienta === 1 ? 'tiene' : 'tienen'} estado.` })
        : null));
}

// Por área, en orden alfabético (en árbol si el catálogo tiene más niveles). Lo que falta
// clasificar va al final. Un observador con áreas asignadas ve solo las suyas. Cada fila dice
// cuántas tiene y cuántas hay en cada estado; tocarla abre sus iniciativas.
function porArea(lista, cat, perfil, conEmpresa, nombresEstado) {
  const nombreEmpresa = new Map(cat.empresas.map((e) => [e.id, e.nombre]));
  const propias = new Set(perfil.rol === 'observador' ? perfil.areas ?? [] : []);
  // Nodos del árbol: id → { area, de: iniciativas que suma, hijos: ids }; raíces y sin área, por empresa.
  const nodos = new Map();
  const raices = new Map();
  const sinArea = new Map();
  for (const x of lista) {
    const e = x.ini.participante.empresa_id;
    let camino = [...x.cadena].reverse(); // de la raíz a su unidad
    const desde = camino.findIndex((a) => propias.has(a.id));
    if (desde > 0) camino = camino.slice(desde);
    if (!camino.length) {
      if (!sinArea.has(e)) sinArea.set(e, []);
      sinArea.get(e).push(x);
      continue;
    }
    if (!raices.has(e)) raices.set(e, new Set());
    raices.get(e).add(camino[0].id);
    camino.forEach((a, k) => {
      if (!nodos.has(a.id)) nodos.set(a.id, { area: a, de: [], hijos: new Set() });
      nodos.get(a.id).de.push(x);
      if (k > 0) nodos.get(camino[k - 1].id).hijos.add(a.id);
    });
  }

  const fila = (titulo, de, { nivel = 0, conSub = false, href = null, nota = null } = {}) => {
    const clases = [nivel ? 'fila--sub' : '', nivel > 1 ? 'fila--sub-2' : '', !nivel && conSub ? 'fila--con-sub' : ''];
    return el('tr', { class: clases.filter(Boolean).join(' ') },
      el('th', { scope: 'row', 'data-etiqueta': 'Área' },
        href ? el('a', { class: 'enlace', href }, titulo) : titulo,
        nota ? el('span', { class: 'celda__nota', text: nota }) : null),
      el('td', { class: 'numero', 'data-etiqueta': 'Iniciativas', text: String(de.length) }),
      nombresEstado.map((nombre) => el('td', { class: 'numero', 'data-etiqueta': nombre,
        text: String(de.filter((x) => x.ini.estado?.nombre === nombre).length) })));
  };

  const porNombre = (a, b) => nodos.get(a).area.nombre.localeCompare(nodos.get(b).area.nombre);
  const rama = (id, nivel) => {
    const n = nodos.get(id);
    const hijos = [...n.hijos].sort(porNombre);
    return [
      // Con la herramienta elegida en el tablero, para que la lista dé el mismo número que la fila.
      fila(n.area.nombre, n.de, { nivel, conSub: hijos.length > 0, href: `#/registros?area=${id}${filtros.herramienta ? `&herramienta=${filtros.herramienta}` : ''}` }),
      ...hijos.flatMap((h) => rama(h, nivel + 1)),
    ];
  };
  const empresasOrdenadas = [...new Set([...raices.keys(), ...sinArea.keys()])]
    .sort((a, b) => (nombreEmpresa.get(a) ?? '').localeCompare(nombreEmpresa.get(b) ?? ''));
  const filas = empresasOrdenadas.flatMap((e) => {
    const total = lista.filter((x) => x.ini.participante.empresa_id === e);
    const encabezado = conEmpresa
      ? [el('tr', { class: 'fila--grupo' }, el('th', { scope: 'colgroup', colspan: String(2 + nombresEstado.length) },
          nombreEmpresa.get(e), el('span', { class: 'celda__nota', text: ` · ${plural(total.length, 'iniciativa', 'iniciativas')}` })))]
      : [];
    const sin = sinArea.get(e);
    return [
      ...encabezado,
      ...[...(raices.get(e) ?? [])].sort(porNombre).flatMap((id) => rama(id, 0)),
      ...(sin ? [fila('Área por clasificar', sin, { nota: 'El facilitador le asigna el área' })] : []),
    ];
  });

  return el('section', { class: 'bloque bloque--tablero', 'aria-labelledby': 'areas-titulo' },
    el('h2', { id: 'areas-titulo', text: 'Por área' }),
    ayuda('Las mismas cifras por área. Toca un área para ver sus iniciativas.'),
    el('div', { class: 'tabla-contenedor tabla-contenedor--resumen' },
      rolesDeTabla(el('table', { class: 'tabla tabla--resumen tabla--progreso' },
        el('caption', { class: 'solo-lectores', text: 'Progreso por área: iniciativas y cuántas hay en cada estado' }),
        el('thead', {}, el('tr', {},
          ['Área', 'Iniciativas', ...nombresEstado].map((t) => el('th', { scope: 'col', text: t })))),
        el('tbody', {}, filas)))));
}
