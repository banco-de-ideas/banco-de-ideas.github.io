import { el, pintar, ROLES, mensajeError, rolesDeTabla, turnoActual, vigente, conteoRevision } from '../ui.js?v=202611250528';
import { cargarCatalogos, listarIniciativas, idsEnRevision, totalPendientes } from '../datos.js?v=202611250528';
import { unidadPorClasificar } from '../etiquetas.js?v=202611250528';
import { interruptorTablero } from './progreso.js?v=202611250528';

const QUE_PUEDE = {
  admin: 'Ves todas las iniciativas. Puedes revisar y corregir registros, resolver respuestas en revisión y mantener los catálogos.',
  facilitador: 'Puedes revisar y corregir registros, asignar herramienta, tipo y área, y resolver respuestas en revisión.',
  observador: 'Puedes ver las iniciativas registradas y el tablero de Progreso. Solo lectura.',
};

const esOperador = (perfil) => perfil.rol === 'admin' || perfil.rol === 'facilitador';
const plural = (n, uno, varios) => (n === 1 ? uno : varios);

// Inicio: primero lo que necesita atención (admin y facilitador), luego cuántas iniciativas
// hay por herramienta y al final el acceso de quien entró. Todo sale de la base (RLS): cada quien
// cuenta solo lo que puede ver.
export async function vistaInicio(contenedor, perfil) {
  const turno = turnoActual();
  const operador = esOperador(perfil);
  // El interruptor abre el tablero que ve el observador (Progreso), con todas las empresas de quien mira.
  const titulo = () => el('div', { class: 'encabezado' }, el('h1', { text: `Hola, ${perfil.nombre}` }), interruptorTablero(false),
    operador ? el('a', { class: 'boton boton--principal', href: '#/registrar' }, 'Registrar iniciativa') : null);
  pintar(contenedor, titulo(), el('p', { class: 'cargando', text: 'Cargando…' }));

  let cat; let iniciativas; let ids;
  try {
    [cat, iniciativas, ids] = await Promise.all([
      cargarCatalogos(), listarIniciativas(), operador ? idsEnRevision() : [],
    ]);
  } catch (e) {
    if (!vigente(turno)) return;
    pintar(contenedor, titulo(), el('p', { class: 'mensaje mensaje--error', role: 'alert', text: mensajeError(e) }));
    return;
  }
  if (!vigente(turno)) return;

  const activas = iniciativas.filter((i) => i.activa && !i.archivada);
  const pendientes = operador ? totalPendientes(ids, iniciativas) : 0;
  if (operador) conteoRevision(pendientes);

  pintar(contenedor,
    titulo(),
    operador ? necesitaAtencion(activas, cat, pendientes) : null,
    el('div', { class: 'inicio__columnas' },
      porEmpresa(activas, cat, operador),
      acceso(perfil)),
  );
}

function necesitaAtencion(activas, cat, pendientes) {
  const porId = new Map(cat.areas.map((a) => [a.id, a]));
  const sinArea = activas.filter((i) => unidadPorClasificar(i, porId)).length;
  const sinHerramienta = activas.filter((i) => !i.track_id).length;
  // Semáforo de uso de datos (Registro v3): lo que más importa vigilar son las rojas.
  const rojas = activas.filter((i) => i.estado_datos === 'rojo').length;
  const filas = [
    { n: pendientes, href: '#/revision', tipo: 'revision',
      texto: plural(pendientes, 'respuesta en revisión', 'respuestas en revisión'),
      ayuda: 'Lo que no calzó al procesar un Registro.' },
    { n: sinArea, href: '#/registros?atencion=area', tipo: 'area',
      texto: plural(sinArea, 'iniciativa con el área por clasificar', 'iniciativas con el área por clasificar'),
      ayuda: 'Asigna el área de la iniciativa.' },
    { n: sinHerramienta, href: '#/registros?herramienta=sin', tipo: 'herramienta',
      texto: plural(sinHerramienta, 'iniciativa sin herramienta asignada', 'iniciativas sin herramienta asignada'),
      ayuda: 'Indica si se hace con Copilot o con Claude.' },
    { n: rojas, href: '#/registros?datos=rojo', tipo: 'rojo',
      texto: plural(rojas, 'iniciativa en rojo por uso de datos', 'iniciativas en rojo por uso de datos'),
      ayuda: 'Se conectarán a un sistema o enviarán información fuera de su área: requieren revisión de TI.' },
  ];
  return el('section', { class: 'bloque bloque--primero', 'aria-labelledby': 'atencion-titulo' },
    el('h2', { id: 'atencion-titulo', text: 'Necesita atención' }),
    el('ul', { class: 'atencion' }, filas.map((f) => el('li', {},
      el('a', { class: `atencion__fila atencion__fila--${f.tipo}${f.n ? '' : ' atencion__fila--al-dia'}`, href: f.href },
        el('span', { class: 'atencion__numero', text: String(f.n) }),
        el('span', { class: 'atencion__titulo', text: f.texto }),
        el('span', { class: 'atencion__ayuda', text: f.n ? f.ayuda : 'Al día.' }))))));
}

// Iniciativas activas por empresa y herramienta. Una sola empresa a la vista: sin fila de total.
function porEmpresa(activas, cat, operador) {
  const columnas = [
    ...cat.tracks.map((t) => ({ texto: t.nombre, cuenta: (lista) => lista.filter((i) => i.track_id === t.id).length })),
    { texto: 'Sin herramienta', cuenta: (lista) => lista.filter((i) => !i.track_id).length },
  ];
  const fila = (nombre, lista, clase) => el('tr', { class: clase },
    el('th', { scope: 'row', 'data-etiqueta': 'Empresa', text: nombre }),
    el('td', { class: 'numero', 'data-etiqueta': 'Iniciativas', text: String(lista.length) }),
    columnas.map((c) => el('td', { class: 'numero', 'data-etiqueta': c.texto, text: String(c.cuenta(lista)) })));

  const filas = cat.empresas.map((e) => fila(e.nombre, activas.filter((i) => i.participante.empresa_id === e.id)));
  if (cat.empresas.length > 1) filas.push(fila('Total', activas, 'fila--total'));

  return el('section', { class: 'bloque', 'aria-labelledby': 'empresas-titulo' },
    el('h2', { id: 'empresas-titulo', text: 'Iniciativas por herramienta' }),
    activas.length
      ? el('div', { class: 'tabla-contenedor tabla-contenedor--resumen' },
          rolesDeTabla(el('table', { class: 'tabla tabla--resumen' },
            el('caption', { class: 'solo-lectores', text: 'Iniciativas activas por empresa y herramienta' }),
            el('thead', {}, el('tr', {},
              ['Empresa', 'Iniciativas', ...columnas.map((c) => c.texto)].map((t) => el('th', { scope: 'col', text: t })))),
            el('tbody', {}, filas))))
      : el('p', { class: 'vacio', text: 'Todavía no hay iniciativas registradas.' }),
    operador
      ? null
      : el('p', { class: 'nota', text: '"En revisión" quiere decir que el equipo está revisando un dato del registro: no tienes que hacer nada.' }),
  );
}

function acceso(perfil) {
  return el('section', { class: 'bloque', 'aria-labelledby': 'acceso-titulo' },
    el('h2', { id: 'acceso-titulo', text: 'Tu acceso' }),
    el('div', { class: 'tarjeta tarjeta--acceso' },
      el('dl', { class: 'datos' },
        el('dt', { text: 'Rol' }), el('dd', { text: ROLES[perfil.rol] || perfil.rol }),
        // Una sola empresa: no se muestra a cuál pertenece quien mira.
        el('dt', { text: 'Correo' }), el('dd', { text: perfil.correo || '—' })),
      el('p', { class: 'texto-secundario', text: QUE_PUEDE[perfil.rol] || '' })));
}
