import { supabase } from './cliente.js?v=202611250528';

// Consultas a Supabase. Cada consulta devuelve solo lo que RLS deja ver a quien tiene la sesión:
// aquí no se filtra por rol ni por empresa.

// Las relaciones se nombran por su restricción (hay dos caminos entre iniciativa y estado).
const SELECT_INICIATIVA = `
  id, codigo, nombre, problema, activa, archivada, archivada_en, requiere_revision, motivo_revision, creado_en,
  registro_formulario_id, tipo_iniciativa_id, tipo_detalle, track_id, estado_id,
  medida_tipo, medida_detalle, valor_antes, situacion_antes, valor_despues, situacion_despues,
  datos_disponibles, resultado_esperado, dato_confidencial, usuario_identificado,
  area_id, area_declarada, frecuencia, empresa_marca, siguiente_paso,
  direccion_id, gerencia_id, jefatura_id, org_otro_niveles, org_directo_niveles, org_cruce_estado,
  modalidad, equipo_nombre, equipo_transversal,
  tipos_datos, autorizacion_jefatura, fecha_autorizacion, origen_datos, envio_externo,
  declaracion_uso, fecha_declaracion, estado_datos, estado_datos_calculado, estado_datos_motivos,
  track:track!iniciativa_track_id_fkey(id, nombre),
  estado:estado_iniciativa!iniciativa_estado_id_track_id_fkey(id, nombre, orden),
  tipo:tipo_iniciativa!iniciativa_tipo_iniciativa_id_fkey(id, nombre:nombre_formulario),
  participante:participante!iniciativa_participante_id_fkey!inner(
    id, nombre, correo, jefatura_nombre, jefatura_correo, empresa_id,
    empresa:empresa!participante_empresa_id_fkey(id, nombre)
  )`;

let catalogos = null;

// Catálogos (cambian poco): se cargan una vez por sesión; olvidarCatalogos() al cerrar sesión.
export async function cargarCatalogos({ forzar = false } = {}) {
  if (catalogos && !forzar) return catalogos;
  const [tracks, estados, tipos, empresas, areas] = await Promise.all([
    supabase.from('track').select('id, nombre, orden').eq('activo', true).order('orden'),
    supabase.from('estado_iniciativa').select('id, track_id, nombre, orden, activo').order('track_id').order('orden'),
    // En pantalla, el tipo con el mismo texto que el formulario.
    supabase.from('tipo_iniciativa').select('id, nombre:nombre_formulario, orden, activo').order('orden'),
    supabase.from('empresa').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('area').select('id, empresa_id, nombre, nivel, padre_id, activo').order('nombre'),
  ]);
  for (const r of [tracks, estados, tipos, empresas, areas]) if (r.error) throw r.error;
  catalogos = {
    tracks: tracks.data,
    estados: estados.data,
    tipos: tipos.data,
    empresas: empresas.data,
    areas: areas.data,
  };
  return catalogos;
}

export function olvidarCatalogos() {
  catalogos = null;
}

// conCoordinacion: trae también los integrantes activos con su rol, para mostrar quién coordina
// (puede no ser quien llenó el Registro).
export async function listarIniciativas({ conCoordinacion = false } = {}) {
  const select = conCoordinacion
    ? `${SELECT_INICIATIVA},
  integrantes:integrante!integrante_iniciativa_id_fkey(rol, activo,
    participante:participante!integrante_participante_id_fkey(id, nombre, correo))`
    : SELECT_INICIATIVA;
  let consulta = supabase.from('iniciativa').select(select).order('codigo');
  if (conCoordinacion) consulta = consulta.eq('integrantes.activo', true);
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

export async function obtenerIniciativa(codigo) {
  const { data, error } = await supabase.from('iniciativa').select(SELECT_INICIATIVA).eq('codigo', codigo).maybeSingle();
  if (error) throw error;
  return data;
}

async function iniciativasPorRespuesta(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('iniciativa').select(SELECT_INICIATIVA).in('registro_formulario_id', ids);
  if (error) throw error;
  return data;
}

export async function iniciativasEnRevision() {
  const { data, error } = await supabase.from('iniciativa').select(SELECT_INICIATIVA).eq('requiere_revision', true).order('codigo');
  if (error) throw error;
  return data;
}

// Un UPDATE sin permiso no da error: afecta 0 filas. Por eso se pide la fila de vuelta.
async function actualizar(tabla, filtro, cambios) {
  let consulta = supabase.from(tabla).update(cambios);
  for (const [columna, valor] of Object.entries(filtro)) consulta = consulta.eq(columna, valor);
  const { data, error } = await consulta.select();
  if (error) throw error;
  if (!data.length) throw Object.assign(new Error('sin permiso'), { code: 'sin_filas' });
  return data[0];
}

export const actualizarIniciativa = (id, cambios) => actualizar('iniciativa', { id }, cambios);
export const actualizarParticipante = (id, cambios) => actualizar('participante', { id }, cambios);

// ---------------------------------------------------------------- integrantes (iniciativas en grupo)

// Integrantes de una iniciativa, activos y quitados, en el orden en que se agregaron. El nombre
// es el que se escribió en el Registro; la persona trae el correo (si el rol la puede ver).
export async function integrantesDe(iniciativaId) {
  const { data, error } = await supabase
    .from('integrante')
    .select(`participante_id, nombre, activo, agregado_en, quitado_en, nota, rol, rol_equipo, estado, excepcion_en, excepcion_nota,
             participante:participante!integrante_participante_id_fkey(id, nombre, correo)`)
    .eq('iniciativa_id', iniciativaId).order('agregado_en');
  if (error) throw error;
  return data;
}

export async function agregarIntegrante(iniciativaId, correo, nombre) {
  const { data, error } = await supabase.rpc('agregar_integrante', {
    p_iniciativa_id: iniciativaId, p_correo: correo, p_nombre: nombre || null,
  });
  if (error) throw error;
  return data;
}

export async function quitarIntegrante(iniciativaId, participanteId, nota) {
  const { error } = await supabase.rpc('quitar_integrante', {
    p_iniciativa_id: iniciativaId, p_participante_id: participanteId, p_nota: nota,
  });
  if (error) throw error;
}

// Registro a mano (admin y facilitador): guarda como el formulario y devuelve { estado, codigo, motivo }.
// Sin código, la respuesta quedó en revisión y el motivo dice por qué.
export async function registrarAMano(respuestas) {
  const { data, error } = await supabase.rpc('registrar_a_mano', { p_respuestas: respuestas });
  if (error) throw error;
  return data;
}

export async function crearEquivalencia(empresaId, texto, areaId) {
  const { error } = await supabase.from('area_alias').insert({ empresa_id: empresaId, texto, area_id: areaId });
  if (error) throw error;
}

// Área nueva del catálogo, de un solo nivel (admin y facilitador; la base valida empresa y nombre).
// Devuelve su id.
export async function crearArea({ empresaId, nombre }) {
  const { data, error } = await supabase.from('area')
    .insert({ empresa_id: empresaId, nombre }).select('id').single();
  if (error) throw error;
  return data.id;
}

// ---------------------------------------------------------------- respuestas en revisión

const SELECT_RESPUESTA = `
  id, formulario, id_respuesta, enviado_en, correo, codigo_iniciativa, respuestas,
  estado_procesamiento, motivo_revision, procesado_en, resuelto_por, resuelto_en, nota_resolucion,
  descartado_en`;

// Respuestas pendientes o en revisión, con lo que se creó a partir de cada una.
export async function listarRevisiones() {
  const { data: respuestas, error } = await supabase
    .from('registro_formulario').select(SELECT_RESPUESTA)
    .in('estado_procesamiento', ['revisar', 'pendiente'])
    .order('enviado_en');
  if (error) throw error;
  return conLoCreado(respuestas);
}

// Solo los ids de las respuestas pendientes o en revisión (para contar sin traerlas completas).
export async function idsEnRevision() {
  const { data, error } = await supabase
    .from('registro_formulario').select('id').in('estado_procesamiento', ['revisar', 'pendiente']);
  if (error) throw error;
  return data.map((r) => r.id);
}

// Lo mismo que muestra la pestaña Pendientes: las respuestas en revisión, más las iniciativas
// marcadas en revisión cuya respuesta de origen no está entre ellas.
export function totalPendientes(ids, iniciativas) {
  const enLista = new Set(ids);
  return ids.length + iniciativas.filter((i) => i.requiere_revision && !enLista.has(i.registro_formulario_id)).length;
}

// Respuestas pendientes que tocan a una iniciativa: la de su Registro.
export async function respuestasPendientesDe(ini) {
  const { data, error } = await supabase
    .from('registro_formulario').select('id, formulario, codigo_iniciativa')
    .in('estado_procesamiento', ['revisar', 'pendiente']);
  if (error) throw error;
  return data.filter((r) => r.id === ini.registro_formulario_id
    || (r.codigo_iniciativa ?? '').trim().toUpperCase() === ini.codigo);
}

// Agrega a cada respuesta la iniciativa que creó.
async function conLoCreado(respuestas) {
  const ini = new Map((await iniciativasPorRespuesta(respuestas.map((r) => r.id))).map((x) => [x.registro_formulario_id, x]));
  return respuestas.map((r) => ({ ...r, iniciativa: ini.get(r.id) }));
}

export async function listarResueltas(limite = 50) {
  const { data, error } = await supabase
    .from('registro_formulario').select(SELECT_RESPUESTA)
    .not('resuelto_en', 'is', null)
    .eq('estado_procesamiento', 'procesado') // una reabierta vuelve a Pendientes
    .order('resuelto_en', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return conLoCreado(data);
}

// Cambios a mano del semáforo de uso de datos, del más nuevo al más viejo. Sin iniciativaId, todos
// los que la sesión puede ver (para la tabla de Registros).
export async function cambiosEstadoDatos(iniciativaId = null) {
  let consulta = supabase.from('estado_datos_cambio')
    .select('id, iniciativa_id, anterior, nuevo, motivo, cambiado_por, cambiado_en')
    .order('cambiado_en', { ascending: false });
  if (iniciativaId) consulta = consulta.eq('iniciativa_id', iniciativaId);
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

// Admin y facilitador: cambia el color con un motivo obligatorio; la base guarda quién y cuándo.
export async function cambiarEstadoDatos(iniciativaId, estado, motivo) {
  const { error } = await supabase.rpc('cambiar_estado_datos', {
    p_iniciativa_id: iniciativaId, p_estado: estado, p_motivo: motivo,
  });
  if (error) throw error;
}

// Nombres del equipo (solo id y nombre): la base los entrega a admin y facilitador;
// a los demás, ninguno. Sirve para mostrar quién resolvió cada revisión.
export async function nombresEquipo() {
  const { data, error } = await supabase.rpc('nombres_equipo');
  if (error) throw error;
  return new Map(data.map((q) => [q.usuario_id, q.nombre]));
}

export async function reintentar(id) {
  const { data, error } = await supabase.rpc('procesar_formularios', { p_ids: [id] });
  if (error) throw error;
  return data;
}

// Solo el admin (lo decide la base): vuelve a poner en revisión una respuesta resuelta por error.
export async function reabrirRevision(id, nota) {
  const { data, error } = await supabase.rpc('reabrir_revision', { p_id: id, p_nota: nota });
  if (error) throw error;
  return data;
}

export async function resolverRevision(id, nota) {
  const { data, error } = await supabase.rpc('resolver_revision', { p_id: id, p_nota: nota });
  if (error) throw error;
  return data;
}

export async function estadoRespuesta(id) {
  const { data, error } = await supabase
    .from('registro_formulario').select('estado_procesamiento, motivo_revision').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Historial de estados de la iniciativa (Idea, Prototipo, Producto), del más viejo al más nuevo.
// Cada cambio trae el estado, la fecha y quién lo hizo (null si lo puso el proceso del Registro).
// Notas de la línea de tiempo (y los avisos de archivar / sacar del archivo), de la más nueva a la
// más vieja. Las ve quien puede ver la iniciativa (decisión de Bryan, 25 nov); escribirlas, solo admin y facilitador.
export async function notasDe(iniciativaId) {
  const { data, error } = await supabase
    .from('iniciativa_nota')
    .select('id, tipo, texto, autor, creado_en')
    .eq('iniciativa_id', iniciativaId).order('creado_en', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return data;
}

export async function agregarNota(iniciativaId, texto) {
  const { error } = await supabase.rpc('agregar_nota', { p_iniciativa_id: iniciativaId, p_texto: texto });
  if (error) throw error;
}

// Archivar (true) o sacar del archivo (false); la nota es opcional.
export async function archivarIniciativa(iniciativaId, archivar, nota = null) {
  const { error } = await supabase.rpc('archivar_iniciativa', {
    p_iniciativa_id: iniciativaId, p_archivar: archivar, p_nota: nota || null,
  });
  if (error) throw error;
}

export async function historialEstados(iniciativaId) {
  const { data, error } = await supabase
    .from('iniciativa_estado_cambio')
    .select('id, cambiado_en, cambiado_por, estado:estado_iniciativa(id, nombre, orden)')
    .eq('iniciativa_id', iniciativaId).order('cambiado_en').order('id');
  if (error) throw error;
  return data;
}
