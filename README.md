# ClinicaFisioterapia

## NFS-e / NFe.io

A tela de Notas Fiscais funciona em modo de preparação mesmo sem emissão fiscal.
Para emitir pela NFe.io, use a Supabase Edge Function
`nfeio-service-invoice` como proxy seguro e informe o endpoint em
`VITE_NFEIO_PROXY_URL`. Não coloque o token da NFe.io diretamente no frontend.

### Testes

1. Crie uma `.env.local` com `NFEIO_API_KEY` e `NFEIO_COMPANY_ID`.
   Use o `Company.Id` da NFe.io, não o `AccountId` que começa com `acc_`.
2. Rode `yarn nfeio:smoke` para validar chave, listar empresas e checar NFS-e
   sem emitir nota.
3. Configure a Inscrição Municipal da empresa na NFe.io com `Environment:
   "Development"` enquanto estiver em homologação.

### Edge Function

Configure os secrets no Supabase:

```sh
supabase secrets set NFEIO_API_KEY=... NFEIO_COMPANY_ID=...
```

Depois publique a função e use a URL gerada no frontend:

```sh
supabase functions deploy nfeio-service-invoice
```

No ambiente do app, configure:

```sh
VITE_NFEIO_PROXY_URL=https://<project-ref>.functions.supabase.co/nfeio-service-invoice
```
