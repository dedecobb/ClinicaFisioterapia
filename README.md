# ClinicaFisioterapia

## NFS-e / NFe.io

A tela de Notas Fiscais funciona em modo de preparação mesmo sem emissão fiscal.
Para emitir pela NFe.io futuramente, configure um backend/proxy seguro e informe
o endpoint em `VITE_NFEIO_PROXY_URL`. Não coloque o token da NFe.io diretamente
no frontend.
