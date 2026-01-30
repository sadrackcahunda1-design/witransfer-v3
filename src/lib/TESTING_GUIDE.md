# Guia de Testes - Correções WiTransfer

## 1. TESTAR LÓGICA DE REVERSÃO (REVERSAL)

### Teste 1.1: Cancelar Booking e Verificar Realocação Automática

**Pré-requisito:**
- Ter pelo menos 2 veículos do mesmo tipo
- Ter uma booking ativa com veículo e motorista

**Passos:**
1. Navegar até Admin > Bookings
2. Selecionar uma booking ativa (status = 'assigned' ou 'confirmed')
3. Clicar "Cancelar e Realocas" (ou button similar)
4. Verificar logs:
   ```
   [REASSIGN] Iniciando reatribuição para booking XXX...
   [REASSIGN] ✅ Novo recurso encontrado! Veículo: YYY, Motorista: ZZZ
   ```

**Verificações:**
- [ ] `reassignments_count` aumentou em 1
- [ ] `reassignment_reason` foi preenchido
- [ ] `status` virou `assigned` ou `pending_partner_acceptance`
- [ ] `partner_id` NÃO é NULL (contrário do antigo behavior)
- [ ] Cliente recebeu email de realocação
- [ ] Nenhuma entrada de waitlist foi criada (porque realocação foi bem-sucedida)

**Teste 1.2: Cancelar com Nenhum Recurso Disponível (→ Waitlist)**

**Pré-requisito:**
- Apenas 1 veículo disponível do tipo necessário
- Todos motoristas ocupados

**Passos:**
1. Cancelar booking
2. Verificar que NÃO conseguiu realocação
3. Ver logs:
   ```
   [REASSIGN] ⏳ Sem recurso compatível. Booking XXX movido para lista de espera.
   ```

**Verificações:**
- [ ] `status` = `waiting_for_resources`
- [ ] `vehicle_id` = NULL
- [ ] `driver_id` = NULL
- [ ] `partner_id` = original (MANTIDO)
- [ ] Entrada em `booking_waitlist` foi criada
- [ ] `waitlist.status` = `waiting`

---

## 2. TESTAR SISTEMA DE WAITLIST

### Teste 2.1: Processar Fila e Realocações

**Pré-requisito:**
- Ter pelo menos 1 booking em waitlist
- Ter um veículo e motorista libertos

**Passos:**
1. Admin Panel > API Call > POST `/api/admin/process-waitlist`
2. Verificar resposta:
   ```json
   {
     "success": true,
     "message": "Waitlist processada com sucesso: 1 realocadas, 0 expiradas",
     "data": {
       "processedCount": 1,
       "reassignedCount": 1,
       "expiredCount": 0
     }
   }
   ```

**Verificações:**
- [ ] Booking que estava em waitlist agora tem `vehicle_id` e `driver_id`
- [ ] Status da booking = `assigned`
- [ ] `booking_waitlist.status` = `reassigned`
- [ ] Cliente recebeu email informando realocação
- [ ] Nenhum erro nos logs

**Teste 2.2: Limpeza de Expirados**

**Pré-requisito:**
- Ter uma entrada de waitlist que expirou (mais de 24h)

**Setup (para simular):**
```sql
-- Simular expiração
UPDATE booking_waitlist 
SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
WHERE id = 'some-id';
```

**Passos:**
1. Executar `/api/admin/process-waitlist`
2. Verificar logs

**Verificações:**
- [ ] Booking com waitlist expirado: `status` = `allocation_failed`
- [ ] Entrada de waitlist foi deletada
- [ ] `expiredCount` no response > 0
- [ ] Log: `${expiredCount} entradas expiradas removidas`

---

## 3. TESTAR UPLOAD COM VALIDAÇÃO

### Teste 3.1: Upload de Imagem Válida

**Passos:**
1. Formulário de Veículo > Seção Imagem
2. Selecionar JPG/PNG/WEBP válido (<5MB)
3. Ver loading "A carregar..."
4. Verificar sucesso: "Imagem do veículo carregada com sucesso!"

**Verificações:**
- [ ] Preview da imagem aparece
- [ ] Campo `image` atualizado com URL
- [ ] Botão submit reabilitado

### Teste 3.2: Upload de Arquivo Muito Grande

**Passos:**
1. Tentar fazer upload de imagem >5MB
2. Verificar erro imediato (cliente-side)

**Verificações:**
- [ ] Erro aparece: `"Imagem muito grande (6.2MB). Máximo: 5120KB"`
- [ ] Arquivo NÃO foi enviado ao servidor
- [ ] Preview NÃO foi atualizado

### Teste 3.3: Upload de Tipo MIME Inválido

**Passos:**
1. Tentar fazer upload de `.exe` renomeado como `.jpg`
2. Sistema deve validar no servidor também

**Verificações:**
- [ ] Servidor rejeita com: `"Tipo de arquivo application/octet-stream não permitido"`
- [ ] Arquivo NÃO foi salvo no storage

### Teste 3.4: Upload com Timeout

**Pré-requisito:**
- Desabilitar conexão de internet ou usar proxy para simular latência

**Passos:**
1. Tentar fazer upload com conexão muito lenta (>30s)
2. Ver timeout

**Verificações:**
- [ ] Erro: `"Tempo limite de upload excedido após 30000ms"`
- [ ] Button é desbloqueado
- [ ] Usuário pode tentar novamente

---

## 4. TESTAR TRATAMENTO DE ERROS EM FORMULÁRIOS

### Teste 4.1: Validação de Campos Obrigatórios

**Passos:**
1. Deixar Marca e Modelo vazios
2. Clicar "Registar Veículo"
3. Verificar mensagens de erro

**Verificações:**
- [ ] Toast mostra: "2 campo(s) obrigatório(s) não preenchido(s): Marca, Modelo"
- [ ] Campo Marca fica vermelho com "Marca é obrigatória"
- [ ] Campo Modelo fica vermelho com "Modelo é obrigatório"
- [ ] Matricula fica vermelho com "Matrícula é obrigatória"
- [ ] Categoria fica vermelha com "Categoria é obrigatória"
- [ ] NÃO fez submit (stay na página)

### Teste 4.2: Upload Durante Submissão

**Passos:**
1. Preencher formulário corretamente
2. Fazer upload de imagem
3. ANTES do upload terminar, clicar submit
4. Ver comportamento

**Verificações:**
- [ ] Button SUBMIT fica disabled enquanto upload está ativo
- [ ] Button mostra "Carregando..." (visual feedback)
- [ ] Title do button: "Aguarde o upload da imagem..."
- [ ] Não é possível fazer duplo-click
- [ ] Depois que upload termina, pode fazer submit

### Teste 4.3: Erro ao Salvar Veículo

**Pré-requisito:**
- Preencher um campo com valor inválido (ex: matrícula já existente)

**Passos:**
1. Preencher formulário
2. Fazer submit
3. Ver erro do servidor

**Verificações:**
- [ ] Toast mostra erro específico (não "Erro ao processar requisição")
- [ ] Exemplo: "Matrícula LD-00-AA-00 já existe"
- [ ] Formulário NÃO é limpo
- [ ] Dados preenchidos mantêm-se (permite corrigir)

### Teste 4.4: Erro de Conexão

**Pré-requisito:**
- Desabilitar internet durante submit

**Passos:**
1. Preencher e submeter
2. Desabilitar conexão rapidamente
3. Ver erro

**Verificações:**
- [ ] Toast mostra: `"Erro ao processar a requisição. Verifique sua conexão."`
- [ ] Pode tentar novamente
- [ ] Dados preenchidos mantêm-se

---

## 5. TESTAR FLUXO DE REALOCAÇÃO DE VEÍCULOS

### Teste 5.1: Realocação de Veículo Quando Parceiro Cancela

**Pré-requisito:**
- Booking confirmada com Parceiro A, Veículo V1, Motorista D1
- Parceiro A tenta cancelar

**Passos:**
1. Admin > Bookings > Selecionar booking
2. Button "Cancelar e Realocas"
3. Verificar resultado

**Cenário A: Há veículo disponível no mesmo parceiro**
- [ ] Booking reatribuída para Veículo V2, mesmo Parceiro A
- [ ] Status = `assigned`
- [ ] Cliente informado por email

**Cenário B: Há veículo em outro parceiro**
- [ ] Booking reatribuída para Veículo V3 (Parceiro B)
- [ ] `partner_id` mudou para B
- [ ] Status = `pending_partner_acceptance`
- [ ] Cliente e Parceiro B informados

**Cenário C: Nenhum veículo disponível**
- [ ] Booking movida para waitlist
- [ ] Status = `waiting_for_resources`
- [ ] Cliente inforado (pode ser automático ou manual)

---

## 6. VERIFICAÇÕES DE LOGS

### Logs Esperados em `/var/log/` ou CloudWatch:

**Para Reversal:**
```
[REASSIGN] Iniciando reatribuição para booking ABC123 (tipo: rental)...
[REASSIGN] Sem recursos no parceiro local. Buscando globalmente...
[REASSIGN] ✅ Novo recurso encontrado! Veículo: V123, Motorista: D456, Novo Parceiro: P789
```

**Para Waitlist:**
```
[WAITLIST_PROCESSOR] Iniciando processamento de fila de espera...
[WAITLIST_PROCESSOR] Encontradas 5 entradas de espera
[WAITLIST_PROCESSOR] ✅ Realocando booking B789 (veículo: V123, motorista: D456)
[WAITLIST_PROCESSOR] Email enviado para customer@example.com
[WAITLIST_PROCESSOR] Waitlist processada com sucesso: 3 realocadas, 1 expirada
```

**Para Upload:**
```
[Storage] Iniciando upload: image.jpg (256KB) para vehicles/images
[Storage] Upload concluído com sucesso: vehicles/images/uuid.jpg
```

**Para Formulário:**
```
[VehicleForm] Removendo debug logs - produção pronta
[UploadAction] Iniciando upload: vehicles/images/uuid.jpg
[UploadAction] Upload concluído: vehicles/images/uuid.jpg
```

---

## 7. MATRIZ DE TESTES

| Feature | Teste | Status | Resultado |
|---------|-------|--------|-----------|
| Reversal | Auto-realocação | ⬜ | |
| Reversal | Sem recurso → Waitlist | ⬜ | |
| Waitlist | Processar fila | ⬜ | |
| Waitlist | Limpar expirados | ⬜ | |
| Upload | Imagem válida | ⬜ | |
| Upload | Arquivo grande | ⬜ | |
| Upload | Tipo MIME inválido | ⬜ | |
| Upload | Timeout | ⬜ | |
| Formulário | Validação obrigatório | ⬜ | |
| Formulário | Upload durante submit | ⬜ | |
| Formulário | Erro ao salvar | ⬜ | |
| Formulário | Erro de conexão | ⬜ | |

---

## 8. PERFORMANCE BASELINE

**Antes das Correções:**
- Reversal sequencial: ~2.5s (pior caso)
- Waitlist: desabilitada
- Upload: sem timeout, pode travar

**Depois das Correções:**
- Reversal paralela: ~1.2s (50% melhoria)
- Waitlist: ~500ms por entrada
- Upload: 30s timeout máximo

**Target:**
- Reversal: <1.5s
- Waitlist: <1s por 100 entradas
- Upload: <20s para 5MB

---

## APROVAÇÃO

- [ ] Todas as correções testadas
- [ ] Sem regressions em features existentes
- [ ] Logs e mensagens de erro são claros
- [ ] Performance aceita
- [ ] Pronto para deploy

**Testado por:** ___________
**Data:** ___________

