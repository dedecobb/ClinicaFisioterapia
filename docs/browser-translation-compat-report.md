# Relatório de compatibilidade com tradução automática

## Arquivos alterados

- `index.html`
- `src/main.tsx`
- `src/lib/browserTranslateCompat.ts`
- `src/i18n/index.ts`
- `src/i18n/ptBR.ts`
- `src/components/layout/Sidebar.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/Badge.tsx`
- `src/pages/Agenda/AgendamentoPage.tsx`
- `src/pages/ClinicalHub.tsx`
- `src/pages/Team.tsx`

## Problemas encontrados e correções

### 1. Google Translate pode alterar nós de texto controlados pelo React

Problema: tradutores automáticos podem envolver nós de texto em elementos próprios. Quando React tenta remover ou inserir nós que foram movidos pelo tradutor, a aplicação pode quebrar com `NotFoundError`.

Correção: foi criada uma camada global em `src/lib/browserTranslateCompat.ts` para tolerar mutações externas em `removeChild` e `insertBefore`.

Antes:

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Depois:

```tsx
import { installBrowserTranslateCompat } from './lib/browserTranslateCompat.ts';

installBrowserTranslateCompat();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### 2. Página declarava idioma incorreto

Problema: o documento estava com `lang="en"` mesmo com interface em português, o que prejudica a detecção do idioma original e aumenta traduções indevidas.

Correção: o idioma foi alterado para `pt-BR` e foi adicionada a diretiva solicitada para Google Translate.

Antes:

```html
<html lang="en">
```

Depois:

```html
<html lang="pt-BR">
<meta name="google" content="notranslate" />
```

### 3. Componentes interativos podiam ser traduzidos e mutados

Problema: botões, inputs, selects, options, textareas, tabs e itens de menu são áreas sensíveis. Se o tradutor modificar a estrutura interna desses elementos, eventos, foco, seleção e re-renderizações podem ficar instáveis.

Correção: a camada global marca controles existentes e futuros com `translate="no"` e `notranslate`, incluindo elementos criados por modais e portals.

Trecho adicionado:

```ts
const interactiveSelector = [
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[data-notranslate]",
].join(",");

const protectInteractiveElements = (root: ParentNode) => {
  if (root instanceof Element && root.matches(interactiveSelector)) {
    markAsNotranslate(root);
  }

  root
    .querySelectorAll(interactiveSelector)
    .forEach((element) => markAsNotranslate(element));
};
```

### 4. Busca por elemento dependia da estrutura exata do DOM

Problema: `ClinicalHub` usava `document.querySelector("textarea")` para focar o campo de evolução. Isso depende da estrutura global do DOM e pode errar o alvo caso a página seja alterada por tradutor, modal ou outro componente.

Correção: foi usado `useRef`, mantendo a lógica no estado/árvore React.

Antes:

```tsx
document
  .querySelector<HTMLTextAreaElement>("textarea")
  ?.focus()
```

Depois:

```tsx
const evolutionTextareaRef = useRef<HTMLTextAreaElement>(null);

evolutionTextareaRef.current?.focus();
```

### 5. Textos de UI misturados com lógica

Problema: labels de navegação, status e ações estavam espalhados nos componentes. Isso aumenta o risco de usar texto exibido como valor interno e dificulta evolução para i18n real.

Correção: foi criada uma camada inicial de i18n em `src/i18n/ptBR.ts` e os textos mais críticos foram movidos para ela.

Antes:

```tsx
{ icon: Calendar, label: 'Agenda', path: '/agenda' }
```

Depois:

```tsx
{ icon: Calendar, label: messages.nav.agenda, path: '/agenda' }
```

Antes:

```tsx
const STATUS_LABEL: Record<StatusAgendamento, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  presenca_registrada: "Presença",
  ausencia_justificada: "Ausência justificada",
  falta: "Falta",
  reposicao: "Reposição",
  cancelada: "Cancelada",
};
```

Depois:

```tsx
const STATUS_LABEL: Record<StatusAgendamento, string> = messages.agenda.status;
```

## Verificações realizadas

- Busca por `querySelector`, `textContent`, `innerText`, `MutationObserver`, `hydrate` e `createPortal`.
- O uso inseguro de `querySelector("textarea")` foi removido.
- Não foram encontrados usos de `textContent`, `innerText`, `innerHTML` ou hydration em `src`.
- `createPortal` permanece em `Financial.tsx`; os controles gerados por portal são protegidos pelo observador global.
- Formulários, dropdowns, botões e options passam a receber proteção automática contra tradução.
- Labels de status e navegação foram separados da lógica em camada i18n inicial.

## Validação

- `npm run build`: passou.
- ESLint nos arquivos alterados: passou.

Observação: `npm run lint` e `tsc` globais ainda falham por problemas preexistentes fora desta correção, incluindo lint em `dist`, imports não usados e erros de tipos em módulos de Agenda/Pacientes.
