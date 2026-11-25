import { el, pintar, campo, selector, conBoton, soltarBoton, errorEn, errorCampo, mensajeError,
  turnoActual, vigente, CORREO_VALIDO } from '../ui.js?v=202611250528';
import { cargarCatalogos, registrarAMano } from '../datos.js?v=202611250528';
import { FRECUENCIA, ORIGEN_DATOS, ENVIO_EXTERNO, TIPOS_DATOS } from '../etiquetas.js?v=202611250528';

// Registro a mano (admin y facilitador): las mismas preguntas y claves que el formulario (F1) y el
// mismo camino en la base (registrar_a_mano → registro_formulario → misma normalización).
// Dos caminos según el estado: Idea habla en condicional; Prototipo y Producto, en presente.
const TEXTOS = {
  idea: {
    descripcion: 'Qué problema quiere resolver y cómo',
    resultado: 'Cómo imagina el resultado',
    usuario: 'Quién más lo usaría (opcional)',
    datos: 'Fuentes de datos o archivos que usaría (opcional)',
    tipos: 'Tipos de información que usaría',
    origen: 'De dónde tomaría los datos',
    envio: '¿Enviaría información automáticamente fuera del área?',
  },
  desarrollada: {
    descripcion: 'Qué problema resuelve y qué hace',
    resultado: 'Cómo se usa hoy',
    usuario: 'Quién lo usa hoy y quién más podría usarlo (opcional)',
    datos: 'Fuentes de datos o archivos que usa (opcional)',
    tipos: 'Tipos de información que usa',
    origen: 'De dónde toma los datos',
    envio: '¿Envía información automáticamente fuera del área?',
  },
};
// Texto de la declaración de uso (Bryan, 25 nov). Debe ser el mismo que el del formulario de Google (DECLARACION en Armar.gs):
// si uno cambia, cambia el otro.
const DECLARACION = 'Declaro que conozco y cumpliré los lineamientos internos del banco para el uso de herramientas de inteligencia artificial y el manejo de la información.';
const AREA_NO_APARECE = 'Mi área no aparece';
const TIPO_OTRO = 'Otro';
// Otra herramienta (como el «Otro:» del formulario): la base la deja en Revisión como «Herramienta no
// registrada», con lo que se escribió, hasta que el equipo la asigne o la agregue al catálogo.
const HERRAMIENTA_OTRA = '__otra__';

export async function vistaRegistrar(contenedor) {
  const turno = turnoActual();
  pintar(contenedor, el('h1', { text: 'Registrar iniciativa' }), el('p', { class: 'cargando', text: 'Cargando…' }));
  let cat;
  try {
    cat = await cargarCatalogos();
  } catch (e) {
    if (!vigente(turno)) return;
    pintar(contenedor, el('h1', { text: 'Registrar iniciativa' }),
      el('p', { class: 'mensaje mensaje--error', role: 'alert', text: mensajeError(e) }));
    return;
  }
  if (!vigente(turno)) return;

  const nombresEstado = [...new Set(cat.estados.filter((x) => x.activo).sort((a, b) => a.orden - b.orden).map((x) => x.nombre))];
  const areas = cat.areas.filter((a) => a.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const texto = (id, tipo = 'text') => el('input', { type: tipo, id, autocomplete: 'off' });
  const parrafo = (id, filas = 3) => el('textarea', { id, rows: filas });

  const correo = texto('r-correo', 'email');
  const nombre = texto('r-nombre');
  const area = selector([{ valor: '', texto: 'Elige un área' },
    ...areas.map((a) => ({ valor: a.nombre, texto: a.nombre })), { valor: AREA_NO_APARECE, texto: AREA_NO_APARECE }], '');
  const areaOtra = texto('r-area-otra');
  const herramienta = selector([{ valor: '', texto: 'Elige una herramienta' },
    ...cat.tracks.map((t) => ({ valor: t.nombre, texto: t.nombre })),
    { valor: HERRAMIENTA_OTRA, texto: 'Otra (escríbela)' }], '');
  const herramientaOtra = texto('r-herramienta-otra');
  const integrantes = parrafo('r-integrantes', 4);
  const nombreIni = texto('r-nombre-ini');
  const estado = selector(nombresEstado.map((n) => ({ valor: n, texto: n })), nombresEstado[0]);
  const descripcion = parrafo('r-descripcion');
  const resultado = parrafo('r-resultado');
  const usuario = texto('r-usuario');
  const tipo = selector([{ valor: '', texto: 'Elige un tipo' },
    ...cat.tipos.filter((t) => t.activo).map((t) => ({ valor: t.nombre, texto: t.nombre })),
    { valor: TIPO_OTRO, texto: 'Otro (escríbelo)' }], '');
  const tipoDetalle = texto('r-tipo-detalle');
  const frecuencia = selector([{ valor: '', texto: 'Elige una frecuencia' },
    ...Object.entries(FRECUENCIA).map(([valor, t]) => ({ valor, texto: t }))], '');
  const datos = parrafo('r-datos');
  const origen = selector([{ valor: '', texto: 'Elige una opción' },
    ...Object.entries(ORIGEN_DATOS).map(([valor, t]) => ({ valor, texto: t }))], '');
  const envio = selector([{ valor: '', texto: 'Elige una opción' },
    ...Object.entries(ENVIO_EXTERNO).map(([valor, t]) => ({ valor, texto: t }))], '');
  const siguiente = parrafo('r-siguiente', 2);
  const autoriza = el('input', { type: 'checkbox', id: 'r-autoriza' });
  const declara = el('input', { type: 'checkbox', id: 'r-declara' });
  const tiposDatos = Object.entries(TIPOS_DATOS).filter(([k]) => k !== 'ninguno').map(([valor, t]) =>
    ({ valor, caja: el('input', { type: 'checkbox', id: `r-tipos-${valor}`, value: valor }), texto: t }));

  // Los campos cuyo texto cambia con el estado, y los que solo existen en Prototipo y Producto.
  const rotulos = {};
  const conRotulo = (clave, id, control, ayuda) => {
    const c = campo(id, TEXTOS.idea[clave], control, ayuda);
    rotulos[clave] = c.querySelector('label');
    return c;
  };
  const cDescripcion = conRotulo('descripcion', 'r-descripcion', descripcion);
  const cResultado = conRotulo('resultado', 'r-resultado', resultado);
  const cUsuario = conRotulo('usuario', 'r-usuario', usuario);
  const cDatos = conRotulo('datos', 'r-datos', datos);
  const cOrigen = conRotulo('origen', 'r-origen', origen);
  const cEnvio = conRotulo('envio', 'r-envio', envio);
  const cSiguiente = campo('r-siguiente', 'Siguiente paso (opcional)', siguiente, '¿Qué le gustaría mejorar o hacer después?');
  const cTipoDetalle = campo('r-tipo-detalle', 'Escribe el tipo', tipoDetalle);
  const cAreaOtra = campo('r-area-otra', 'Nombre del área', areaOtra);
  const cHerramientaOtra = campo('r-herramienta-otra', 'Escribe la herramienta', herramientaOtra);
  const grupoTipos = el('fieldset', { class: 'grupo-casillas', id: 'r-tipos' },
    el('legend', { text: TEXTOS.idea.tipos }),
    tiposDatos.map((t) => el('label', { class: 'casilla' }, t.caja, ' ', t.texto)));
  rotulos.tipos = grupoTipos.querySelector('legend');

  const alCambiarEstado = () => {
    const ya = estado.value !== nombresEstado[0];
    const t = ya ? TEXTOS.desarrollada : TEXTOS.idea;
    for (const [clave, rotulo] of Object.entries(rotulos)) rotulo.textContent = t[clave];
    cSiguiente.hidden = !ya;
  };
  const alCambiarArea = () => { cAreaOtra.hidden = area.value !== AREA_NO_APARECE; };
  const alCambiarTipo = () => { cTipoDetalle.hidden = tipo.value !== TIPO_OTRO; };
  const alCambiarHerramienta = () => { cHerramientaOtra.hidden = herramienta.value !== HERRAMIENTA_OTRA; };
  herramienta.addEventListener('change', alCambiarHerramienta);
  alCambiarHerramienta();
  estado.addEventListener('change', alCambiarEstado);
  area.addEventListener('change', alCambiarArea);
  tipo.addEventListener('change', alCambiarTipo);
  alCambiarEstado(); alCambiarArea(); alCambiarTipo();

  const boton = el('button', { type: 'submit', class: 'boton boton--principal', id: 'r-guardar', text: 'Registrar iniciativa' });
  const formulario = el('form', { class: 'formulario', novalidate: true },
    el('h2', { text: 'Quien registra' }),
    campo('r-correo', 'Correo', correo),
    campo('r-nombre', 'Nombre completo', nombre),
    // Mismo orden que el formulario de Google: lo general de la iniciativa y, al final, el estado (de él depende
    // si las preguntas siguientes van en condicional o en presente).
    el('h2', { text: 'La iniciativa' }),
    campo('r-nombre-ini', 'Nombre de la iniciativa', nombreIni),
    campo('r-herramienta', 'Herramienta', herramienta),
    cHerramientaOtra,
    campo('r-area', '¿De qué área es la iniciativa?', area),
    cAreaOtra,
    campo('r-tipo', '¿Qué tipo de producto de IA es?', tipo), cTipoDetalle,
    campo('r-integrantes', 'Personas de la iniciativa', integrantes,
      'Una por línea, con nombre y correo. La primera coordina. Quien registra se incluye solo si participa.'),
    campo('r-estado', '¿En qué estado está?', estado),
    el('h2', { text: 'Cuéntanos la iniciativa' }),
    cDescripcion, cResultado, cUsuario,
    campo('r-frecuencia', 'Frecuencia de la tarea (opcional)', frecuencia),
    cDatos, cSiguiente,
    el('h2', { text: 'Uso responsable de datos' }),
    grupoTipos, cOrigen, cEnvio,
    el('label', { class: 'casilla' }, autoriza, ' El responsable del área autorizó el uso de la información confidencial o restringida'),
    el('h2', { text: 'Declaración de uso' }),
    el('label', { class: 'casilla' }, declara, ` ${DECLARACION}`),
    el('div', { class: 'acciones' }, boton));

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEn(formulario, null);
    const v = (c) => c.value.trim();
    const faltas = [
      [correo, !CORREO_VALIDO.test(v(correo)), 'Escribe un correo válido, por ejemplo nombre@empresa.com.'],
      [nombre, !v(nombre), 'Escribe el nombre.'],
      [nombreIni, !v(nombreIni), 'Escribe el nombre de la iniciativa.'],
      [herramienta, !herramienta.value, 'Elige la herramienta.'],
      [herramientaOtra, herramienta.value === HERRAMIENTA_OTRA && !v(herramientaOtra), 'Escribe la herramienta.'],
      [area, !area.value, 'Elige un área.'],
      [areaOtra, area.value === AREA_NO_APARECE && !v(areaOtra), 'Escribe el nombre del área.'],
      [tipo, !tipo.value, 'Elige el tipo.'],
      // Como en el formulario: al menos una línea con un correo.
      [integrantes, !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(v(integrantes)), 'Escribe al menos una persona, con su correo.'],
      [descripcion, !v(descripcion), 'Describe la iniciativa.'],
      // Obligatoria como en el formulario (25 nov): el resultado. Quién lo usa, la frecuencia y las fuentes de datos son opcionales.
      [resultado, !v(resultado), 'Escribe el resultado.'],
      [origen, !origen.value, 'Elige de dónde toma los datos.'],
      [envio, !envio.value, 'Elige una opción.'],
      [declara, !declara.checked, 'Hay que marcar la declaración de uso.'],
    ];
    const falta = faltas.find(([, mal]) => mal);
    if (falta) { errorCampo(falta[0], falta[2]); return; }
    const tipos = tiposDatos.filter((t) => t.caja.checked).map((t) => t.valor);
    if (!tipos.length) { errorEn(formulario, 'Marca al menos un tipo de información.'); return; }

    const respuestas = {
      correo: v(correo), nombre: v(nombre), area: area.value, herramienta: herramienta.value === HERRAMIENTA_OTRA ? v(herramientaOtra) : herramienta.value,
      integrantes: v(integrantes), nombre_iniciativa: v(nombreIni), estado: estado.value,
      descripcion: v(descripcion), resultado_esperado: v(resultado), usuario_identificado: v(usuario),
      tipo: tipo.value, frecuencia: frecuencia.value, datos_disponibles: v(datos),
      tipos_datos: tipos.join(', '), origen_datos: origen.value, envio_externo: envio.value,
      declaracion_uso: 'Sí',
    };
    if (area.value === AREA_NO_APARECE) respuestas.area_otra = v(areaOtra);
    if (tipo.value === TIPO_OTRO && v(tipoDetalle)) respuestas.tipo_detalle = v(tipoDetalle);
    if (!cSiguiente.hidden && v(siguiente)) respuestas.siguiente_paso = v(siguiente);
    if (autoriza.checked) respuestas.autorizacion_area = 'Sí';
    // Lo vacío no se envía: la base lo trata igual que una pregunta sin responder.
    for (const [k, x] of Object.entries(respuestas)) if (x === '') delete respuestas[k];

    try {
      const r = await conBoton(boton, 'Registrando…', () => registrarAMano(respuestas));
      if (r.codigo) { location.hash = `#/registros/${r.codigo}`; return; }
      soltarBoton(boton);
      errorEn(formulario, `No se creó la iniciativa: ${r.motivo ?? 'revisa los datos'}. Quedó en Respuestas en revisión.`);
    } catch (err) {
      soltarBoton(boton);
      errorEn(formulario, mensajeError(err));
    }
  });

  pintar(contenedor,
    el('h1', { text: 'Registrar iniciativa' }),
    el('p', { class: 'texto-secundario', text: 'Mismas preguntas que el formulario. Al guardar se abre la ficha de la iniciativa; si algo no calza, queda en Respuestas en revisión.' }),
    el('div', { class: 'tarjeta' }, formulario));
}
