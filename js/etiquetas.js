// Textos para mostrar datos de forma legible. Solo vocabulario genérico de la plataforma:
// nada de empresas, áreas ni personas (eso llega siempre de la base).

export const FORMULARIOS = { registro: 'Registro' };

// Clave guardada en la respuesta del Registro → pregunta del formulario, en el orden acordado en F1
// (18 nov). El registro a mano usa las mismas claves. Las preguntas que cambian de tiempo verbal
// según el estado (Idea o ya desarrollada) se muestran aquí en su forma general.
const PREGUNTAS = {
  registro: {
    correo: 'Correo de quien registra',
    nombre: 'Nombre de quien registra',
    area: '¿De qué área es la iniciativa?',
    area_otra: 'Nombre del área (eligió "Mi área no aparece")',
    herramienta: '¿Con qué herramienta?',
    integrantes: 'Personas de la iniciativa (la primera coordina)',
    nombre_iniciativa: 'Nombre de la iniciativa',
    estado: '¿En qué estado está?',
    descripcion: '¿Qué problema resuelve y cómo?',
    resultado_esperado: 'Resultado esperado o cómo se usa hoy',
    usuario_identificado: '¿Quién lo usa o lo usaría?',
    tipo: '¿Qué tipo de producto de IA es?',
    tipo_detalle: 'Tipo escrito en "Otro"',
    frecuencia: '¿Con qué frecuencia se hace la tarea?',
    datos_disponibles: '¿Qué fuentes de datos o archivos usa o usaría?',
    tipos_datos: '¿Qué tipos de información usa o usaría?',
    autorizacion_area: 'Autorización del responsable del área',
    origen_datos: '¿De dónde toma los datos?',
    envio_externo: '¿Envía información automáticamente fuera del área?',
    declaracion_uso: 'Declaración de uso',
    siguiente_paso: 'Siguiente paso (Prototipo o Producto)',
  },
};

// Una clave sin pregunta conocida se muestra tal cual, más legible ("tiene_prototipo" → "Tiene prototipo").
export function pregunta(formulario, clave) {
  const conocida = PREGUNTAS[formulario]?.[clave];
  if (conocida) return conocida;
  if (clave.startsWith('sin_clave')) return clave;
  const texto = clave.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Orden de las preguntas: primero las del formulario (en su orden) y luego las demás.
export function paresRespuesta(formulario, respuestas) {
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) return null;
  const orden = Object.keys(PREGUNTAS[formulario] || {});
  const claves = Object.keys(respuestas).sort((a, b) => {
    const ia = orden.indexOf(a); const ib = orden.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return claves.map((clave) => [pregunta(formulario, clave), valorTexto(respuestas[clave])]);
}

function valorTexto(valor) {
  if (valor === null || valor === undefined || valor === '') return '(vacío)';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

// ---------------------------------------------------------------- iniciativa

export const textoHerramienta = (ini) => ini.track?.nombre ?? 'Sin herramienta asignada';

export function textoTipo(ini) {
  if (ini.tipo?.nombre) return ini.tipo.nombre;
  return ini.tipo_detalle ? `Otro: ${ini.tipo_detalle}` : 'Por definir';
}



// ---------------------------------------------------------------- área y estado

// Área por clasificar: la iniciativa no tiene un área del catálogo (eligió "Mi área no aparece").
export const unidadPorClasificar = (ini, porId) => !porId.has(ini.area_id);

// Idea (todavía no construida) o ya desarrollada (Prototipo o Producto): cambia el tiempo verbal
// de las preguntas. Sin estado, se trata como Idea.
export const esIdea = (ini) => !ini.estado || ini.estado.orden === 1;

// ---------------------------------------------------------------- uso responsable (Registro v3)

// Semáforo de uso de datos, del más restrictivo al más libre.
export const SEMAFOROS = [
  { valor: 'rojo', texto: 'Rojo' },
  { valor: 'amarillo', texto: 'Amarillo' },
  { valor: 'verde_registro', texto: 'Verde con registro' },
  { valor: 'verde', texto: 'Verde' },
];
export const textoSemaforo = (valor) => SEMAFOROS.find((s) => s.valor === valor)?.texto ?? 'Sin color';

// Los motivos llegan como "Amarillo: usará información privada…": en pantalla, sin el color delante.
export function motivosSemaforo(ini) {
  return (ini.estado_datos_motivos ?? []).map((m) => {
    const texto = m.replace(/^(Rojo|Amarillo|Verde con registro|Verde):\s*/, '');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });
}

export const TIPOS_DATOS = {
  publica: 'Pública', interna: 'Interna', simulada: 'Simulada', privada: 'Privada',
  confidencial: 'Confidencial', restringida: 'Restringida', no_seguro: 'No está seguro(a)',
  ninguno: 'Todavía no usa datos',
};
export const textoTiposDatos = (tipos) => (tipos?.length ? tipos.map((t) => TIPOS_DATOS[t] ?? t).join(' · ') : null);

export const ORIGEN_DATOS = {
  sistema: 'Se conectará directamente a un sistema de la empresa',
  archivos_propios: 'Datos que ya tiene (Excel, CSV, PDF, reportes, correos)',
  ejemplo: 'Datos de ejemplo o inventados',
  no_sabe: 'Aún no lo sabe',
};
export const ENVIO_EXTERNO = { si: 'Sí', no: 'No', no_sabe: 'No lo sabe' };
export const MODALIDAD = { individual: 'Individual', equipo: 'En equipo' };
export const FRECUENCIA = {
  diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', ocasional: 'Ocasional',
};

// ---------------------------------------------------------------- áreas (organigrama)
// Un solo nivel (Área).

// El área es de la iniciativa, no de cada persona.
export function textoArea(ini, areas) {
  const area = areas.find((a) => a.id === ini.area_id);
  return area ? area.nombre : `Por clasificar: ${ini.area_declarada || '(no escribió su área)'}`;
}

// Opciones de un selector de área, en orden alfabético. Las áreas sin nivel (el caso de hoy) van
// con su camino completo, agrupadas solo por la empresa si hay varias.
// empresaDe(área): nombre de la empresa para el grupo, o null si hay una sola.
export function opcionesArea(areas, empresaDe = () => null) {
  const opciones = [];
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
  const hijos = (id) => areas.filter((x) => x.padre_id === id).sort(porNombre);
  const recorrer = (a, camino, grupo) => {
    opciones.push({ valor: a.id, texto: camino.join(' › ') || a.nombre, grupo: grupo ?? undefined });
    for (const h of hijos(a.id)) recorrer(h, [...camino, h.nombre], grupo);
  };
  const raices = areas.filter((a) => !a.padre_id || !areas.some((x) => x.id === a.padre_id))
    .sort((a, b) => (empresaDe(a) ?? '').localeCompare(empresaDe(b) ?? '') || porNombre(a, b));
  for (const raiz of raices) {
    const empresa = empresaDe(raiz);
    if (raiz.nivel) recorrer(raiz, [], empresa ? `${empresa} · ${raiz.nombre}` : raiz.nombre);
    else recorrer(raiz, [raiz.nombre], empresa);
  }
  return opciones;
}

// ---------------------------------------------------------------- motivos de revisión

// Los motivos se guardan separados por "; ", tal como los escribe la base. Para mostrarlos:
// con mayúscula inicial y sin "en el panel" (quien los lee ya está en él).
// Algunos motivos llevan "; " por dentro ("Su área no está en la lista; escribió: X", "…; parecidas:
// INI-001 «…»", o lo que escribió la persona entre paréntesis): esos trozos se vuelven a unir con
// el motivo anterior, para que cuente como uno solo.
const continua = (anterior, trozo) => /^(escribió|parecidas):/i.test(trozo)
  || (anterior.split('(').length > anterior.split(')').length)
  || (anterior.split('«').length > anterior.split('»').length);

export const motivos = (texto) => (texto ? texto.split('; ').filter(Boolean) : [])
  .reduce((lista, trozo) => {
    if (lista.length && continua(lista[lista.length - 1], trozo)) lista[lista.length - 1] += `; ${trozo}`;
    else lista.push(trozo);
    return lista;
  }, [])
  .map((m) => m.trim().replace(/ en el panel$/i, ' aquí'))
  .map((m) => m.charAt(0).toUpperCase() + m.slice(1));
