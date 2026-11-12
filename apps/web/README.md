# Jerico web dashboard

The Next.js web application can be run locally or as part of the self-hosted Compose deployment.

## Local development

```sh
pnpm --filter @jerico/web dev
```

Set `NEXT_PUBLIC_API_URL` to the public HTTPS origin of the Jerico API before building for deployment.

## Self-hosted container

The Dockerfile builds Next.js in standalone mode from the monorepo root so workspace UI/contracts packages are traced correctly. Compose passes `NEXT_PUBLIC_API_URL` as a build argument because the auth client embeds it in the browser bundle at build time.

The container listens on port 3000. In the self-hosted Compose file, the port is bound to host loopback; route external traffic through a trusted HTTPS reverse proxy.
