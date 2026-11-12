# Servidor en Supabase (Compartir y Campañas)

Supabase da una base de datos PostgreSQL gratuita accesible desde el navegador.
La app no usa sus tablas directamente: todas las operaciones pasan por funciones
(`supabase/migrations/20261108000000_agarias.sql`) que comprueban claves, reglas
de campaña y tamaños. Así no hace falta ningún servidor propio: Netlify sirve la
página y Supabase guarda los datos.

## Puesta en marcha (una vez)

1. Crea un proyecto en <https://supabase.com> (plan gratuito). Región cercana a
   tus jugadores (p. ej. `sa-east-1`, São Paulo).
2. *SQL Editor* → pega el contenido de cada archivo de `supabase/migrations/`, en
   orden (`20261108000000_agarias.sql`, `20261112000000_tienda.sql`,
   `20261113000000_comerciantes.sql` y `20261114000000_mundo_dm.sql`)
   → *Run*. Se pueden ejecutar varias veces sin problema.
3. *Project Settings → API*: copia la **URL** del proyecto y la clave
   **anon / publishable**. Nunca uses la clave `service_role` en la web.
4. En Netlify → *Site configuration → Environment variables* añade:
   - `VITE_SUPABASE_URL` = la URL (`https://xxxx.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = la clave anon/publishable
5. *Deploys → Trigger deploy*. Comprueba en la web: «Homebrew → Crear campaña».

Para desarrollo local, pon las mismas variables en `frontend/.env`.

## Qué protege y qué no

| Operación | Quién | Comprobado en el servidor |
|---|---|---|
| Ver un personaje compartido | Cualquiera con el enlace | ID aleatorio de 96 bits |
| Editar/borrar un personaje compartido | Quien lo compartió | Token de edición (hash SHA-256) + revisión |
| Publicar un personaje de una campaña | Su dueño | Todo su Homebrew de esa campaña debe estar publicado, oculto o retirado |
| Ver la campaña y su contenido | DM y jugadores | Clave de DM o código de invitación (hash); los jugadores no ven borradores |
| Cambiar reglas, estados, borrar, rotar invitación | Sólo el DM | Clave de DM |
| Crear o editar Homebrew | DM; jugadores sólo si la regla del tipo es «propuestas» | Rol + regla; los jugadores sólo crean propuestas y sólo editan las suyas |
| Ver y usar el mercado de la Tienda de una campaña | DM y jugadores | Clave de DM o código de invitación + revisión (dos compras a la vez no se pisan) |
| Pasar días o reiniciar el mercado de la campaña | Sólo el DM | El servidor rechaza cambios de `day`/`seed` que no vengan del DM |

La Tienda no guarda monedas ni inventarios en Supabase: siguen dentro del
documento del personaje. Si el personaje está compartido, cada compra publica
su copia en línea (`share_update`). En `shop_markets` sólo vive el estado del
mercado de cada campaña (existencias, eventos, día, relaciones con vendedores y
registro de compras). Sin esta migración, la Tienda funciona con un mercado
local en cada dispositivo y lo avisa.

Límites: mercado de la Tienda ≤ 1,5 MB por campaña, documento de personaje ≤ 2 MB, elemento Homebrew ≤ 200 KB, reglas ≤ 10 KB,
1000 elementos por campaña.

No hay cuentas: quien tenga la clave de DM es DM. Si se filtra, el DM no puede
cambiarla desde la app (sí la invitación). Si algún día hace falta, se puede
añadir Supabase Auth y vincular las campañas a usuarios sin cambiar el formato
de los personajes.

Supabase no limita la frecuencia de llamadas por IP en el plan gratuito; si
hubiera abuso, se puede activar la protección de la API desde su panel.

## Pruebas

```bash
# PostgreSQL local (cualquier versión ≥ 13) con un usuario con permisos de creación:
AGARIAS_TEST_PG="-h /tmp -p 5432 -U postgres" python -m pytest supabase/tests -q
```
