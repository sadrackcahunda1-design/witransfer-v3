# Checklist de Deployment - WiTransfer Correções

## PRÉ-DEPLOYMENT (Fazer ANTES de qualquer mudança)

### Preparação
- [ ] Backup completo da DB produção
- [ ] Backup dos logs atuais
- [ ] Comunicar time de operações
- [ ] Agend ar janela de manutenção se necessário

### Validação do Código
- [ ] Todas as correções fizeram merge
- [ ] Sem conflitos em git
- [ ] Build local passa sem erros
- [ ] Nenhum debug log `console.log("[v0]"...)` restante
- [ ] TypeScript sem erros (`npm run build`)

### Review de Alterações
- [ ] `/src/app/api/admin/listing-bookings/route.ts` - reviewado
- [ ] `/src/app/api/admin/process-waitlist/route.ts` - reviewado
- [ ] `/src/lib/storage.ts` - reviewado
- [ ] `/src/actions/private/storage/actions.ts` - reviewado
- [ ] `/src/components/form/vehicles.tsx` - reviewado

---

## DEPLOYMENT FASE 1: CÓDIGO (SEM DOWNTIME)

### Deploy
- [ ] `git push` para branch de deployment
- [ ] CI/CD pipeline passa
- [ ] Verificar logs de build: sem warnings críticos
- [ ] Aplicação inicia sem erro

### Verificação Pós-Deploy
- [ ] Health check retorna OK
- [ ] Admin dashboard carrega
- [ ] Nenhum error 500 nos logs
- [ ] Timeout de requests é normal (<100ms adicional)

### Monitoramento Inicial (10 min)
- [ ] Nenhum erro em `/api/admin/listing-bookings`
- [ ] Nenhum erro em `/api/admin/process-waitlist`
- [ ] Nenhum erro em uploads
- [ ] Database connections estáveis

---

## DEPLOYMENT FASE 2: SCHEMA (COM DOWNTIME ~5MIN)

### Antes de Executar SQL
- [ ] Última backup confirmada
- [ ] Rollback script preparado (veja abaixo)
- [ ] DBA disponível

### Executar Schema Updates
```bash
# Conectar à DB
psql -U postgres -d witransfer_db

# Executar script
\i /src/lib/SCHEMA_UPDATES_NEEDED.sql

# Verificar sucesso
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name IN ('reassignments_count', 'reassignment_reason')
ORDER BY ordinal_position;
```

### Verificações Pós-Schema
- [ ] Todas as colunas adicionadas (no output acima)
- [ ] Todos os índices criados sem erro
- [ ] Triggers criados e ativos
- [ ] Views criadas
- [ ] Nenhuma constraint violation
- [ ] DB size não aumentou demais (< 50MB)

### Rollback Rápido (se necessário)
```bash
# Executar reverso (comentado no script para segurança)
DROP TRIGGER trigger_log_booking_changes ON bookings;
DROP FUNCTION log_booking_changes();
DROP TABLE booking_audit_log;
DROP VIEW vw_booking_changes;
DROP VIEW vw_waitlist_status;

-- Remover colunas (CUIDADO!)
ALTER TABLE bookings DROP COLUMN reassignments_count;
ALTER TABLE bookings DROP COLUMN reassignment_reason;
-- ... (copiar do arquivo de rollback)
```

---

## DEPLOYMENT FASE 3: TESTES EM PRODUÇÃO

### Teste 1: Reversal Básico (15 min)
```bash
1. Criar booking nova de teste
2. Atribuir veículo e motorista
3. Cancelar com "Realocas"
4. Verificar logs: [REASSIGN] ✅
5. Confirmar reassignments_count = 1
```

**Sucesso Criteria:**
- [ ] Logs mostram reatribuição bem-sucedida
- [ ] Nenhum erro 500
- [ ] Resposta em <2s

### Teste 2: Upload (15 min)
```bash
1. Ir a criar veículo
2. Upload imagem válida (<5MB)
3. Verificar "carregando..." feedback
4. Confirmar imagem aparece
5. Submeter formulário
```

**Sucesso Criteria:**
- [ ] Upload completa rapidamente (<5s)
- [ ] Preview aparece
- [ ] Nenhum erro de CORS
- [ ] URL salva corretamente

### Teste 3: Waitlist (30 min)
```bash
1. Cancionar booking (sem recursos disponíveis)
2. Confirmar entrou em waitlist
3. Liberar um veículo/motorista
4. Chamar POST /api/admin/process-waitlist
5. Verificar realocação automática
```

**Sucesso Criteria:**
- [ ] Booking movida para waiting_for_resources
- [ ] Process-waitlist executa sem erro
- [ ] Booking realocada automaticamente
- [ ] Cliente recebe email

### Teste 4: Validação de Formulário (10 min)
```bash
1. Deixar campo obrigatório vazio
2. Clicar submit
3. Ver erro por campo + toast
4. Corrigir e resubmeter
```

**Sucesso Criteria:**
- [ ] Erro aparece só UMA VEZ (não duplicado)
- [ ] Mensagem é específica (não genérica)
- [ ] Não fez submit (dados mantêm-se)

---

## PÓS-DEPLOYMENT (24h)

### Monitoramento
- [ ] Nenhum aumento em error rate
- [ ] Response times estáveis
- [ ] Memory usage normal
- [ ] DB queries lentas? Verificar índices

### Verificações Operacionais
- [ ] 10+ realocações completadas com sucesso
- [ ] 0 crashes relacionados às mudanças
- [ ] Clientes reportam melhor UX (sem erros genéricos)
- [ ] Waitlist está sendo processada

### Rollback Decision Point (24h)
Se algum dos abaixo:
- [ ] Error rate > 5% aumento
- [ ] Response time > 5s média
- [ ] Múltiplos crashes de realocação
- [ ] DB está muito lenta

**AÇÃO**: Executar rollback imediato

---

## DOCUMENTAÇÃO PÓS-DEPLOYMENT

### Criar/Atualizar
- [ ] Runbooks de operação (realocação manual, etc)
- [ ] Alerts e thresholds
- [ ] Dashboards de monitoramento
- [ ] Troubleshooting guide

### Comunicação
- [ ] Notify time que deployment foi bem-sucedido
- [ ] Email com summary das mudanças
- [ ] Post no Slack/Teams com status

---

## CHECKLIST FINAL

### Antes de Marcar como "Done"
- [ ] Todas as 3 fases completadas
- [ ] Testes passaram
- [ ] Nenhum regression
- [ ] Documentação atualizada
- [ ] Time notificado

### Assinatura de Aprovação
```
Deployment realizado por: _________________ Data: _________
Aprovado por: _________________ Data: _________
Testado por: _________________ Data: _________
```

---

## EMERGENCY CONTACTS

Se algo quebrar:
- **Database Issue**: DBA on-call
- **API Issue**: Backend team lead
- **UI/Form Issue**: Frontend team lead
- **Deployment Rollback**: DevOps lead

---

## ROLLBACK PROCEDURE (RÁPIDO)

### Se precisa reverter tudo:

**Passo 1: Reverter Código**
```bash
git revert <commit-hash> -m 1
git push origin main
# Redeploy (CI/CD automático)
```

**Passo 2: Reverter Schema (se necessário)**
```bash
# Usar script de rollback
psql -U postgres -d witransfer_db -f SCHEMA_ROLLBACK.sql
```

**Tempo estimado**: 10-15 minutos (completo)

---

## SUCCESS METRICS (24h depois)

| Métrica | Target | Resultado |
|---------|--------|-----------|
| Realocações/dia | +50% | _____ |
| Error rate | <2% | _____ |
| Resposta de reversão | <2s | _____ |
| Upload sucesso | >98% | _____ |
| Customer feedback | Positivo | _____ |

---

## NOTES

- Guardar este checklist completado para audit
- Attachment: Logs de deployment (24h)
- Attachment: Performance baseline antes/depois
- Attachment: Teste screenshots

---

**Versão**: 1.0
**Data de Criação**: 2026-01-30
**Última Atualização**: 2026-01-30

