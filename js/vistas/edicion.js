import { el, avisar, mensajeError, campo, selector, conBoton, soltarBoton, errorEn, errorCampo } from '../ui.js?v=202611250528';
import { actualizarIniciativa, crearEquivalencia, crearArea, olvidarCatalogos,
  respuestasPendientesDe } from '../datos.js?v=202611250528';
import { opcionesArea, FRECUENCIA } from '../etiquetas.js?v=202611250528';

// Formularios para corregir una iniciativa (admin y facilitador). Se usan en el detalle del
// registro y en Respuestas en revisión. La base decide si cada cambio se guarda.
// alGuardar(): vuelve a cargar la vista para mostrar lo que quedó en la base.
export function formulariosEdicion(ini, cat, { alGuardar, prefijo = `ed-${ini.id}` }) {
  return el('div', { class: 'edicion' },
    formularioIniciativa(ini, cat, prefijo, alGuardar),
    formularioDatos(ini, cat, prefijo, alGuardar),
    formularioArea(ini, cat, prefijo, alGuardar),
    formularioActiva(ini, prefijo, alGuardar),
  );
}

// Bloques de corrección con algo cambiado y sin guardar (cada formulario se guarda con su botón).
// Devuelve [{ titulo, control }] con el primer campo cambiado de cada bloque. Sirve para no
// resolver una revisión creyendo que el cambio ya quedó en la base.
export function sinGuardar(contenedor) {
  const cambiado = (c) => {
    if (c.type === 'checkbox') return c.checked !== c.defaultChecked;
    if (c.tagName === 'SELECT') return [...c.options].some((o) => o.selected !== o.defaultSelected);
    return c.value !== c.defaultValue;
  };
  return [...contenedor.querySelectorAll('.edicion form')].flatMap((f) => {
    const control = [...f.querySelectorAll('input, textarea, select')].find(cambiado);
    return control ? [{ titulo: f.dataset.titulo ?? f.querySelector('h3')?.textContent ?? 'un bloque', control }] : [];
  });
}

// Guarda solo lo que cambió (accion devuelve false si no había cambios). Si no se puede
// guardar, el error queda dentro del formulario hasta el siguiente intento.
async function guardar(formulario, boton, accion, alGuardar, enCurso = 'Guardando…') {
  errorEn(formulario, null);
  try {
    const hubo = await conBoton(boton, enCurso, accion);
    if (hubo === false) {
      soltarBoton(boton);
      avisar('No hay cambios para guardar.', 'info');
      return;
    }
    avisar(typeof hubo === 'string' ? hubo : 'Guardado.', 'exito');
    alGuardar();
  } catch (e) {
    errorEn(formulario, mensajeError(e));
  }
}

// Botón con id: al volver a pintar, el foco regresa a él.
const botonGuardar = (id, texto, clase = 'boton boton--principal') => el('button', { type: 'submit', id, class: clase }, texto);

// El texto original se compara recortado (como se envía el nuevo): un espacio o salto de línea
// al final de lo que llegó del formulario no cuenta como cambio, y no se reescribe sin querer.
function cambios(original, nuevos) {
  const salida = {};
  for (const [clave, valor] of Object.entries(nuevos)) {
    const antes = typeof original[clave] === 'string' ? (original[clave].trim() || null) : (original[clave] ?? null);
    if (antes !== (valor ?? null)) salida[clave] = valor;
  }
  return salida;
}

const vacioANull = (texto) => (texto.trim() === '' ? null : texto.trim());

// Nombre, estado y lo que escribió sobre su iniciativa. El estado sale de la lista de su herramienta.
// Las preguntas van en forma general: sirven para una Idea y para una ya desarrollada.
function formularioIniciativa(ini, cat, p, alGuardar) {
  const nombre = el('input', { type: 'text', value: ini.nombre ?? '', required: true });
  const estados = cat.estados.filter((e) => e.track_id === ini.track_id && (e.activo || e.id === ini.estado_id));
  const estado = selector(estados.map((e) => ({ valor: e.id, texto: e.nombre })), ini.estado_id ?? '');
  const descripcion = el('textarea', { rows: 4 }, ini.situacion_antes ?? '');
  const resultado = el('textarea', { rows: 3 }, ini.resultado_esperado ?? '');
  const usuario = el('input', { type: 'text', value: ini.usuario_identificado ?? '' });
  const datos = el('textarea', { rows: 2 }, ini.datos_disponibles ?? '');
  const frecuencia = selector([
    { valor: '', texto: 'Sin responder' },
    ...Object.entries(FRECUENCIA).map(([valor, texto]) => ({ valor, texto })),
  ], ini.frecuencia ?? '');
  const boton = botonGuardar(`${p}-guardar-iniciativa`, 'Guardar datos de la iniciativa');

  const formulario = el('form', { class: 'tarjeta tarjeta--plana', novalidate: true },
    el('h3', { text: 'Nombre, estado y descripción' }),
    el('div', { class: 'rejilla' },
      campo(`${p}-nombre`, 'Nombre de la iniciativa', nombre),
      ini.track_id && estados.length
        ? campo(`${p}-estado`, 'Estado', estado, 'Idea, Prototipo o Producto: qué tan madura está.')
        : el('p', { class: 'campo__ayuda', text: 'Sin herramienta asignada no hay estado: asígnala abajo.' }),
    ),
    campo(`${p}-descripcion`, 'Qué problema resuelve y cómo', descripcion),
    campo(`${p}-resultado`, 'Resultado esperado o cómo se usa hoy', resultado),
    el('div', { class: 'rejilla' },
      campo(`${p}-usuario`, 'Quién lo usa o lo usaría', usuario),
      campo(`${p}-frecuencia`, 'Frecuencia de la tarea', frecuencia),
    ),
    campo(`${p}-datos`, 'Fuentes de datos o archivos', datos),
    el('div', { class: 'acciones' }, boton),
  );
  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!nombre.value.trim()) {
      errorCampo(nombre, 'La iniciativa necesita un nombre.');
      return;
    }
    guardar(formulario, boton, async () => {
      const nuevos = cambios(ini, {
        nombre: nombre.value.trim(),
        ...(ini.track_id && estados.length ? { estado_id: estado.value ? Number(estado.value) : null } : {}),
        situacion_antes: vacioANull(descripcion.value),
        resultado_esperado: vacioANull(resultado.value),
        frecuencia: frecuencia.value || null,
        usuario_identificado: vacioANull(usuario.value),
        datos_disponibles: vacioANull(datos.value),
      });
      if (!Object.keys(nuevos).length) return false;
      await actualizarIniciativa(ini.id, nuevos);
      return true;
    }, alGuardar);
  });
  return formulario;
}

function formularioDatos(ini, cat, p, alGuardar) {
  const herramienta = selector([
    ...(ini.track_id ? [] : [{ valor: '', texto: 'Sin herramienta asignada' }]),
    ...cat.tracks.map((t) => ({ valor: t.id, texto: t.nombre })),
    // Una herramienta ya desactivada en el catálogo sigue como opción: si no, el selector
    // mostraría otra y "Guardar" la cambiaría sin que nadie lo pidiera.
    ...(ini.track_id && !cat.tracks.some((t) => t.id === ini.track_id)
      ? [{ valor: ini.track_id, texto: ini.track?.nombre ?? 'Herramienta actual' }] : []),
  ], ini.track_id ?? '');
  const tipo = selector([
    // Sin tipo del catálogo: "Otro" si escribió el detalle; si no, falta definirlo.
    { valor: '', texto: ini.tipo_detalle ? 'Otro (lo escrito en Detalle)' : 'Por definir' },
    ...cat.tipos.filter((t) => t.activo || t.id === ini.tipo_iniciativa_id).map((t) => ({ valor: t.id, texto: t.nombre })),
  ], ini.tipo_iniciativa_id ?? '');
  const detalle = el('input', { type: 'text', value: ini.tipo_detalle ?? '' });
  const boton = botonGuardar(`${p}-guardar-datos`, 'Guardar herramienta y tipo');

  const formulario = el('form', { class: 'tarjeta tarjeta--plana', novalidate: true },
    el('h3', { text: 'Herramienta y tipo' }),
    el('div', { class: 'rejilla' },
      campo(`${p}-track`, 'Herramienta', herramienta, 'Al cambiarla, el estado se ajusta solo.'),
      campo(`${p}-tipo`, 'Tipo de iniciativa', tipo),
      campo(`${p}-detalle`, 'Detalle del tipo', detalle, 'Lo que escribió en "Otro".'),
    ),
    el('div', { class: 'acciones' }, boton),
  );
  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    guardar(formulario, boton, async () => {
      const nuevos = cambios(ini, {
        track_id: herramienta.value ? Number(herramienta.value) : null,
        tipo_iniciativa_id: tipo.value ? Number(tipo.value) : null,
        tipo_detalle: vacioANull(detalle.value),
      });
      if (!Object.keys(nuevos).length) return false;
      await actualizarIniciativa(ini.id, nuevos);
      return true;
    }, alGuardar);
  });
  return formulario;
}

// Igual que privado.normalizar_texto de la base: minúsculas, sin tildes (ñ → n), espacios simples.
const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Área de la iniciativa: un solo nivel. Si la persona eligió "Mi área no aparece", llega sin área y
// con lo que escribió; aquí se le asigna una de la lista o se crea una nueva.
function formularioArea(ini, cat, p, alGuardar) {
  const persona = ini.participante;
  const areas = cat.areas.filter((a) => a.empresa_id === persona.empresa_id && (a.activo || a.id === ini.area_id));
  const opciones = [{ valor: '', texto: 'Por clasificar' }, ...opcionesArea(areas)];
  const area = selector(opciones, ini.area_id ?? '');
  const declarada = ini.area_declarada?.trim();
  // La equivalencia solo sirve para lo escrito en "Mi área no aparece": si lo escrito ya es el
  // nombre de un área, la base la encuentra sola y no se ofrece.
  const yaEnCatalogo = Boolean(declarada) && areas.some((a) => normalizar(a.nombre) === normalizar(declarada));
  const ofrecerEquivalencia = Boolean(declarada) && !yaEnCatalogo && areas.length > 0;
  const equivalencia = el('input', { type: 'checkbox', id: `${p}-equiv`, checked: ofrecerEquivalencia && !ini.area_id });
  const boton = botonGuardar(`${p}-guardar-area`, 'Guardar área');

  const formulario = el('form', { novalidate: true, 'data-titulo': 'Área de la iniciativa' },
    el('h3', { text: 'Área de la iniciativa' }),
    declarada && !yaEnCatalogo
      ? el('p', { class: 'texto-secundario', text: `Su área no aparecía en la lista; escribió: "${declarada}".` })
      : null,
    areas.length
      ? campo(`${p}-area`, 'Área asignada', area)
      : el('p', { class: 'mensaje mensaje--atencion', text: 'Todavía no hay áreas en el catálogo.' }),
    ofrecerEquivalencia
      ? el('div', { class: 'casilla' }, equivalencia,
          el('label', { for: `${p}-equiv`, text: `Recordar "${declarada}" como esta área: si otra persona lo escribe en "Mi área no aparece", el área se asigna sola` }))
      : null,
    areas.length ? el('div', { class: 'acciones' }, boton) : null,
  );
  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    guardar(formulario, boton, async () => {
      const nueva = area.value ? Number(area.value) : null;
      const cambia = nueva !== (ini.area_id ?? null);
      const guardarEquivalencia = equivalencia.checked && declarada && nueva;
      if (!cambia && !guardarEquivalencia) return false;
      if (cambia) await actualizarIniciativa(ini.id, { area_id: nueva });
      if (guardarEquivalencia) {
        try {
          await crearEquivalencia(persona.empresa_id, declarada, nueva);
        } catch (err) {
          if (err.code === '23505') {
            return cambia
              ? 'Área guardada. Ya había una equivalencia para ese texto: no se cambió.'
              : 'Ya había una equivalencia para ese texto: no se cambió nada.';
          }
          throw err;
        }
        return cambia ? 'Área y equivalencia guardadas.' : 'Equivalencia guardada.';
      }
      return true;
    }, alGuardar);
  });
  return el('div', { class: 'tarjeta tarjeta--plana area-persona' },
    formulario, formularioAreaNueva(ini, declarada && !yaEnCatalogo ? declarada : null, p, alGuardar));
}

// Un área que existe pero no estaba en el catálogo: se crea y queda asignada a la iniciativa.
// Para que aparezca en el formulario de Registro, hay que agregarla también allí.
function formularioAreaNueva(ini, declarada, p, alGuardar) {
  const persona = ini.participante;
  const nombre = el('input', { type: 'text', value: declarada ?? '' });
  const boton = botonGuardar(`${p}-crear-area`, 'Crear y asignar');
  const formulario = el('form', { novalidate: true, 'data-titulo': 'Agregar un área nueva' },
    el('p', { class: 'texto-secundario', text: 'Queda creada en el catálogo y asignada a esta iniciativa. Para que aparezca en el formulario de Registro, agrégala también allí.' }),
    campo(`${p}-area-nombre`, 'Nombre del área', nombre),
    el('div', { class: 'acciones' }, boton));
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEn(formulario, null);
    const texto = nombre.value.trim();
    if (!texto) { errorCampo(nombre, 'Escribe el nombre del área.'); return; }
    let id;
    try {
      id = await conBoton(boton, 'Creando…', () => crearArea({ empresaId: persona.empresa_id, nombre: texto }));
    } catch (err) {
      errorEn(formulario, err.code === '23505'
        ? 'Ya existe un área con ese nombre: elígela en "Área asignada".'
        : mensajeError(err));
      return;
    }
    // El catálogo se guarda en memoria: se vuelve a leer para que la lista muestre el área nueva.
    olvidarCatalogos();
    try {
      await actualizarIniciativa(ini.id, { area_id: id });
      avisar(`Área "${texto}" creada y asignada.`, 'exito');
    } catch (err) {
      // El área ya quedó creada: al recargar aparece en la lista y se asigna a mano.
      avisar(`El área "${texto}" se creó, pero no se pudo asignar (${mensajeError(err)}). Elígela en "Área asignada" y guarda.`, 'error');
    }
    alGuardar();
  });
  return el('details', { class: 'desplegable', id: `${p}-area-nueva` },
    el('summary', { text: 'Agregar un área nueva' }), formulario);
}

// Va aparte del resto, con su propio marco: desactivar (para un registro hecho por error) saca la
// iniciativa de listas e indicadores. No se borra y se puede deshacer.
function formularioActiva(ini, p, alGuardar) {
  const boton = el('button', {
    type: 'button', id: `${p}-activa`,
    class: `boton ${ini.activa ? 'boton--delicado' : 'boton--secundario'}`,
  }, ini.activa ? 'Desactivar iniciativa' : 'Reactivar iniciativa');
  const zona = el('div', { class: ini.activa ? 'tarjeta tarjeta--plana zona-delicada' : 'tarjeta tarjeta--plana' },
    el('h3', { text: ini.activa ? 'Desactivar la iniciativa' : 'Reactivar la iniciativa' }),
    el('p', { class: 'texto-secundario', text: ini.activa
      ? 'Para un registro hecho por error. Deja de aparecer en listas e indicadores. Su Registro en revisión se resuelve con la nota "Iniciativa desactivada". Nada se borra y se puede reactivar.'
      : 'Vuelve a aparecer en listas e indicadores. Lo que se resolvió al desactivarla sigue resuelto.' }),
    el('div', { class: 'acciones' }, boton));
  boton.addEventListener('click', async () => {
    let pregunta = `¿Reactivar ${ini.codigo}? Vuelve a aparecer en listas e indicadores.`;
    if (ini.activa) {
      // Lo que queda pendiente, para decirlo antes de confirmar (la base resuelve la revisión sola).
      const enRevision = (await respuestasPendientesDe(ini).catch(() => [])).length;
      pregunta = [
        `¿Desactivar ${ini.codigo}? No se borra: deja de aparecer en listas e indicadores. Se puede reactivar.`,
        enRevision ? `\n${enRevision === 1 ? '1 respuesta en revisión se resolverá' : `${enRevision} respuestas en revisión se resolverán`} con la nota "Iniciativa desactivada".` : '',
      ].join('');
    }
    if (!window.confirm(pregunta)) return;
    guardar(zona, boton, async () => {
      await actualizarIniciativa(ini.id, { activa: !ini.activa });
      return ini.activa ? 'Iniciativa desactivada.' : 'Iniciativa reactivada.';
    }, alGuardar, ini.activa ? 'Desactivando…' : 'Reactivando…');
  });
  return zona;
}
