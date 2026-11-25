// Datos públicos del proyecto de Supabase: la dirección y la llave publishable.
// La llave publishable está hecha para ir en el navegador; los datos los protege RLS en la base.
// Aquí nunca va la llave secreta (service_role) ni la contraseña de la base.
export const SUPABASE_URL = 'https://iuxpmvghjwaltvyewomn.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_v9dkWK6vkgtQudZGh3kIyw_-Ap8xlxx';

export const ZONA_HORARIA = 'America/Managua';

// Reglas de contraseña del proyecto (Authentication → Email). La base las exige igual.
export const CLAVE_LARGO_MINIMO = 10;
