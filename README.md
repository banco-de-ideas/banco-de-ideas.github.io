# Banco de Ideas

Aplicativo para registrar y dar seguimiento a iniciativas de uso de inteligencia artificial con Copilot o Claude.

Es una página estática (HTML, CSS y JavaScript con módulos, sin paso de compilación) que se conecta a un proyecto de Supabase. Los datos y los permisos viven en la base: cada rol (administrador, facilitador, observador) ve y cambia solo lo que las políticas de seguridad de la base le permiten.

## Contenido

- `index.html`: la página y su política de seguridad de contenido.
- `css/`: estilos.
- `js/`: la aplicación (`app.js` arranca; `config.js` trae la dirección y la llave publishable del proyecto; `vistas/` tiene cada pantalla).
- `vendor/`: copia fija de supabase-js, con su licencia.
- `img/`: logo.

## Configuración

`js/config.js` solo lleva la dirección del proyecto y su llave **publishable**, hecha para ir en el navegador. La llave secreta (`service_role`) y las contraseñas de la base nunca van en este repositorio. Si cambia la dirección del proyecto, se cambia también en la política `connect-src` de `index.html`.

## Probar en local

Con cualquier servidor de archivos estáticos desde esta carpeta, por ejemplo:

```
npx serve .
```

## Publicar

Se publica con GitHub Pages desde la rama `main`, carpeta raíz. Al cambiar archivos, sube el número de versión de las referencias `?v=` para que los navegadores no usen copias viejas.
