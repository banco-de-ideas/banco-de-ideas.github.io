import { el, pintar, mensajeError } from '../ui.js?v=202611250528';
import { iniciarSesion } from '../sesion.js?v=202611250528';

export function vistaLogin(contenedor, { alEntrar, aviso = null }) {
  const error = el('p', { class: 'mensaje mensaje--error', id: 'login-error', role: 'alert', hidden: true });
  const correo = el('input', {
    id: 'login-correo', name: 'correo', type: 'email', autocomplete: 'username',
    required: true, spellcheck: 'false', autocapitalize: 'none',
  });
  const clave = el('input', {
    id: 'login-clave', name: 'clave', type: 'password', autocomplete: 'current-password', required: true,
  });
  const mostrar = el('button', {
    type: 'button', class: 'boton boton--secundario', 'aria-pressed': 'false', 'aria-controls': 'login-clave',
    onclick: () => {
      const visible = clave.type === 'password';
      clave.type = visible ? 'text' : 'password';
      mostrar.setAttribute('aria-pressed', String(visible));
      mostrar.textContent = visible ? 'Ocultar' : 'Mostrar';
    },
  }, 'Mostrar');
  const entrar = el('button', { type: 'submit', class: 'boton boton--principal boton--ancho' }, 'Entrar');

  const formulario = el('form', { class: 'formulario', novalidate: true, 'aria-describedby': 'login-error' },
    el('div', { class: 'campo' },
      el('label', { for: 'login-correo', text: 'Correo' }),
      correo),
    el('div', { class: 'campo' },
      el('label', { for: 'login-clave', text: 'Contraseña' }),
      el('div', { class: 'campo__con-boton' }, clave, mostrar)),
    error,
    entrar,
  );

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.hidden = true;
    if (!correo.value.trim() || !clave.value) {
      mostrarError('Escribe tu correo y tu contraseña.');
      (correo.value.trim() ? clave : correo).focus();
      return;
    }
    entrar.disabled = true;
    entrar.textContent = 'Entrando…';
    let perfil;
    try {
      perfil = await iniciarSesion(correo.value, clave.value);
    } catch (e) {
      mostrarError(mensajeError(e));
      clave.value = '';
      clave.focus();
      entrar.disabled = false;
      entrar.textContent = 'Entrar';
      return;
    }
    // Fuera del try: un fallo al pintar la pantalla no es un error de contraseña ni debe borrarla.
    alEntrar(perfil);
  });

  function mostrarError(texto) {
    error.textContent = texto;
    error.hidden = false;
  }

  pintar(contenedor,
    el('section', { class: 'tarjeta tarjeta--angosta', 'aria-labelledby': 'login-titulo' },
      el('div', { class: 'tarjeta__marca' },
        el('img', { class: 'tarjeta__logo', src: 'img/logo.png', alt: 'Avanz', width: 412, height: 214 }),
        el('p', { class: 'tarjeta__nombre', text: 'Banco de Ideas' })),
      el('h1', { id: 'login-titulo', text: 'Iniciar sesión' }),
      el('p', { class: 'texto-secundario', text: 'Iniciativas de uso de inteligencia artificial con Copilot y Claude.' }),
      aviso ? el('p', { class: 'mensaje mensaje--atencion', role: 'status', text: aviso }) : null,
      formulario,
      el('p', { class: 'nota', text: 'Si olvidaste tu contraseña, pídele al administrador que la restablezca.' }),
    ),
  );
}
