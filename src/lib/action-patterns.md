# Padrões Padronizados para Actions e APIs

## Visão Geral

Este documento descreve os padrões unificados para usar em toda a aplicação para garantir:
- Tratamento de erro consistente
- Mensagens sempre legíveis (nunca "erro desconhecido")
- Delays onde necessário para feedback visual
- Types seguros em todo o fluxo

## ActionResult - Tipo Unificado

```typescript
interface ActionResult<T = any> {
  success: boolean;           // Status da operação
  message?: string;           // Mensagem de sucesso (traduzida)
  error?: string;             // Mensagem de erro (traduzida)
  errorCode?: string;         // Código do erro
  data?: T;                   // Dados retornados
  timestamp?: string;         // ISO timestamp
}
```

## 1. Server Actions (Public)

### Criar uma Server Action

```typescript
// src/actions/public/exemplo/my-action.ts
"use server";

import { createPublicAction } from "@/middlewares/actions/action-factory";
import { createSuccessResult, createErrorResult } from "@/types";
import type { ActionResult } from "@/types";

export async function myAction(input: any): Promise<ActionResult> {
  return createPublicAction(
    "MyAction",
    async (data) => {
      // Sua lógica aqui
      
      // ✅ Usar helpers
      if (error) {
        throw new Error("Mensagem legível do erro");
      }
      
      return createSuccessResult(resultado, "Ação concluída!");
    },
    input,
    { delay: 300 } // Opcional: delay em ms
  );
}
```

## 2. Server Actions (Private/Autenticadas)

```typescript
// src/actions/private/admin/restricted-action.ts
"use server";

import { createPrivateAction } from "@/middlewares/actions/action-factory";
import type { ActionResult } from "@/types";

export async function restrictedAction(input: any): Promise<ActionResult> {
  return createPrivateAction(
    "RestrictedAction",
    async (data) => {
      // Lógica protegida
      // ...
    },
    input
  );
}
```

## 3. APIs (Next.js Routes)

### Sempre retornar ActionResult

```typescript
// src/app/api/exemplo/route.ts
import { NextResponse } from "next/server";
import type { ActionResult } from "@/types";

export async function POST(request: Request): Promise<NextResponse<ActionResult>> {
  try {
    const body = await request.json();
    
    // Validar
    if (!body.email) {
      return NextResponse.json(
        {
          success: false,
          error: "Email é obrigatório",
          errorCode: "MISSING_EMAIL"
        },
        { status: 400 }
      );
    }

    // Processar
    const result = await processData(body);

    return NextResponse.json({
      success: true,
      message: "Operação concluída com sucesso",
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao processar",
        errorCode: "INTERNAL_ERROR"
      },
      { status: 500 }
    );
  }
}
```

## 4. Usar Actions no Cliente

### Com useActionHandler

```typescript
"use client";

import { useActionHandler } from "@/hooks/use-action-handler";
import { myAction } from "@/actions/public/exemplo/my-action";

export function MyComponent() {
  const { execute, loading, error } = useActionHandler();

  const handleSubmit = async (data: any) => {
    const resultado = await execute(
      () => myAction(data),
      {
        successMessage: "Feito!", // Opcional
        errorMessage: "Falhou!",  // Opcional
        onSuccess: (data) => {
          console.log("Sucesso:", data);
        },
        onError: (error) => {
          console.error("Erro:", error);
        },
        delay: 500, // Delay antes de processar resultado
      }
    );
  };

  return (
    <div>
      <button 
        onClick={() => handleSubmit({})} 
        disabled={loading}
      >
        {loading ? "Carregando..." : "Enviar"}
      </button>
      {error && <p>{error}</p>}
    </div>
  );
}
```

### Sem useActionHandler (direto)

```typescript
"use client";

import { myAction } from "@/actions/public/exemplo/my-action";
import { useNotification } from "@/hooks/use-notification";

export function SimpleComponent() {
  const { tratarResultado } = useNotification();

  const handleClick = async () => {
    const resultado = await myAction({ /* dados */ });
    tratarResultado(resultado, "Sucesso!", "Erro!");
  };

  return <button onClick={handleClick}>Clique</button>;
}
```

## 5. Padrão de Notificações

### useNotification Hook

```typescript
const { sucesso, erro, aviso, info, tratarResultado, tratarErro } = useNotification();

// Sucesso
sucesso("Operação completada!");

// Erro
erro("Algo deu errado");

// Aviso
aviso("Cuidado!");

// Info
info("Para sua informação...");

// Tratar ActionResult
tratarResultado(resultado, "Mensagem padrão sucesso");

// Tratar erro puro
tratarErro(new Error("Algo falhou"));
```

## 6. Exemplo Completo: Criar Reserva

### API
```typescript
// src/app/api/bookings/route.ts
export async function POST(request: Request): Promise<NextResponse<ActionResult>> {
  try {
    const body = await request.json();
    
    if (!body.email) {
      return NextResponse.json({
        success: false,
        error: "Email obrigatório",
        errorCode: "MISSING_EMAIL"
      }, { status: 400 });
    }

    const booking = await supabase.from("bookings").insert([body]).select().single();
    
    return NextResponse.json({
      success: true,
      message: "Reserva criada com sucesso!",
      data: { booking }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Erro ao criar"
    }, { status: 500 });
  }
}
```

### Server Action
```typescript
// src/actions/public/booking/create-booking.ts
export async function createBooking(data: any): Promise<ActionResult> {
  return createPublicAction(
    "CreateBooking",
    async (input) => {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Erro ao criar");
      }
      
      return result;
    },
    data,
    { delay: 500 }
  );
}
```

### Cliente
```typescript
"use client";

import { useActionHandler } from "@/hooks/use-action-handler";
import { createBooking } from "@/actions/public/booking/create-booking";

export function BookingForm() {
  const { execute, loading } = useActionHandler();

  const handleSubmit = async (formData: any) => {
    const resultado = await execute(
      () => createBooking(formData),
      {
        successMessage: "Reserva criada!",
        onSuccess: (data) => {
          // Redirecionar ou atualizar UI
        }
      }
    );
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(new FormData(e.currentTarget));
    }}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? "Criando..." : "Criar Reserva"}
      </button>
    </form>
  );
}
```

## Boas Práticas

### ✅ DO

- Sempre retornar ActionResult com `success` e `error` claro
- Usar mensagens traduzidas e legíveis
- Aplicar delay quando operação é muito rápida (< 500ms)
- Usar helpers: `createSuccessResult()`, `createErrorResult()`
- Logar com prefixo: `[API]`, `[Action]`, `[PUBLIC ACTION]`
- Tratar erros com mensagens específicas (não genéricas)

### ❌ DON'T

- Lançar erros sem mensagem clara
- Usar "Erro desconhecido" ou "Algo deu errado"
- Retornar diferentes estruturas de resposta
- Esquecer de validar entrada
- Fazer requisições sem tratamento de erro

## Migrations

Se encontrar código antigo:

### Antes (Antigo)
```typescript
try {
  const result = await fetch(...);
  if (!result.ok) {
    throw new Error("Erro");
  }
  toast.success("Sucesso!");
} catch (error) {
  toast.error("Erro inesperado");
}
```

### Depois (Novo)
```typescript
try {
  const result: ActionResult = await fetch(...);
  const { tratarResultado } = useNotification();
  tratarResultado(result);
} catch (error) {
  const { tratarErro } = useNotification();
  tratarErro(error);
}
```

## Checklist para Novo Endpoint

- [ ] API retorna `ActionResult` com `success` boolean
- [ ] Mensagens de erro são específicas e traduzidas
- [ ] Server Action envolvendo API usa `createPublicAction` ou `createPrivateAction`
- [ ] Cliente usa `useActionHandler` ou `useNotification`
- [ ] Delay apropriado se operação for rápida
- [ ] Logs com prefixo apropriado `[API]`, `[Action]`, etc
- [ ] Validação de entrada em API
- [ ] Testes de erro inclusos
