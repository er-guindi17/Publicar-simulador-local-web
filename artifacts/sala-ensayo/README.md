# Sala de ensayo

Aplicación web para ensayar un flujo de participantes de forma aislada. Genera participantes ficticios y permite observar el progreso, los eventos y el historial reciente. No se conecta a Kahoot ni a otros servicios externos.

## Ejecutar

Desde la raíz del repositorio, inicia ambos procesos en terminales separadas:

```bash
pnpm install
```

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/sala-ensayo run dev
```

En Replit, usa los workflows **API Server** y **Sala de ensayo**.

No hace falta configurar claves, cuentas ni variables de entorno para esta aplicación.

## Datos y límites

- El PIN solo identifica visualmente el ensayo y no se reenvía a servicios externos.
- Se generan entre 1 y 100 participantes ficticios por ensayo.
- Se permiten hasta 5 ensayos activos y se conservan hasta 20 ensayos recientes.
- El historial vive en la memoria del proceso del servidor y se pierde cuando se reinicia.

## Comprobaciones

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --dir artifacts/sala-ensayo typecheck
```

Si cambias el contrato de la API en `lib/api-spec/openapi.yaml`, regenera los clientes con:

```bash
pnpm --filter @workspace/api-spec run codegen
```
