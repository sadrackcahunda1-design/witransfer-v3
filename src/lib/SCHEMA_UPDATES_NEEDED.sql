-- ============================================
-- SCHEMA UPDATES NECESÁRIOS
-- WiTransfer - Correções de Banco de Dados
-- ============================================
-- Executar APÓS as correções de código serem deployadas

-- 1. Adicionar campos de rastreamento na tabela bookings
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS reassignments_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reassignment_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255),
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_bookings_reassignments_count 
ON bookings(reassignments_count) 
WHERE status IN ('waiting_for_resources', 'reassigned');

CREATE INDEX IF NOT EXISTS idx_bookings_status_updated 
ON bookings(status, updated_at DESC);

-- 2. Melhorar tabela booking_waitlist com priorização
ALTER TABLE booking_waitlist 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0 COMMENT 'Prioridade: 0=normal, 1=alta, 2=urgente',
ADD COLUMN IF NOT EXISTS reassignment_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reassignment_attempt TIMESTAMP;

-- Adicionar índices de performance
CREATE INDEX IF NOT EXISTS idx_booking_waitlist_priority 
ON booking_waitlist(priority DESC, created_at ASC) 
WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_booking_waitlist_expires 
ON booking_waitlist(expires_at ASC) 
WHERE status = 'waiting';

-- 3. Adicionar campos de auditoria na tabela bookings
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(255);

-- 4. Criar tabela de auditoria completa (se não existir)
CREATE TABLE IF NOT EXISTS booking_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'cancelled', 'reassigned'
    previous_values JSONB,
    new_values JSONB,
    reason VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_booking_audit_log_booking_id ON booking_audit_log(booking_id);
CREATE INDEX idx_booking_audit_log_timestamp ON booking_audit_log(timestamp DESC);

-- 5. Criar função para log automático de mudanças
CREATE OR REPLACE FUNCTION log_booking_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_by UUID;
    v_action TEXT;
BEGIN
    -- Determinar quem fez a mudança (de current_user_id se disponível)
    v_changed_by := current_setting('app.current_user_id', true)::UUID;
    IF v_changed_by IS NULL THEN
        v_changed_by := NEW.updated_by;
    END IF;

    -- Determinar ação
    IF TG_OP = 'INSERT' THEN
        v_action := 'created';
    ELSIF TG_OP = 'UPDATE' THEN
        -- Detectar tipo específico de update
        IF OLD.status != NEW.status THEN
            IF NEW.status = 'cancelled' THEN
                v_action := 'cancelled';
            ELSIF NEW.status IN ('waiting_for_resources', 'reassigned', 'pending_partner_acceptance') THEN
                v_action := 'reassigned';
            ELSE
                v_action := 'status_changed';
            END IF;
        ELSE
            v_action := 'updated';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'deleted';
    END IF;

    -- Inserir log
    INSERT INTO booking_audit_log (
        booking_id,
        changed_by,
        action,
        previous_values,
        new_values,
        reason
    ) VALUES (
        NEW.id,
        v_changed_by,
        v_action,
        to_jsonb(OLD),
        to_jsonb(NEW),
        NEW.reassignment_reason OR NEW.cancel_reason
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ativar trigger
DROP TRIGGER IF EXISTS trigger_log_booking_changes ON bookings;
CREATE TRIGGER trigger_log_booking_changes
AFTER INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION log_booking_changes();

-- 6. Criar trigger para limpeza automática de waitlist expirados
CREATE OR REPLACE FUNCTION cleanup_expired_waitlist()
RETURNS void AS $$
BEGIN
    -- Marcar bookings com waitlist expirado como allocation_failed
    UPDATE bookings
    SET status = 'allocation_failed', updated_at = CURRENT_TIMESTAMP
    WHERE id IN (
        SELECT booking_id FROM booking_waitlist 
        WHERE status = 'waiting' AND expires_at < CURRENT_TIMESTAMP
    );

    -- Deletar entradas expiradas de waitlist
    DELETE FROM booking_waitlist 
    WHERE status = 'waiting' AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- 7. Criar job recorrente para processar waitlist (comentado - usar scheduler externo)
-- Este pode ser chamado periodicamente via API ou cron job
-- SELECT cleanup_expired_waitlist();

-- 8. Adicionar índice em vehicles para filtro de serviço
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS maintenance_until TIMESTAMP COMMENT 'Até quando está em manutenção';

CREATE INDEX IF NOT EXISTS idx_vehicles_status_service 
ON vehicles(status, available_for) 
WHERE status = 'active';

-- 9. Adicionar campos de partner em booking_waitlist para realocação inteligente
ALTER TABLE booking_waitlist 
ADD COLUMN IF NOT EXISTS alternative_partner_id UUID REFERENCES partners(id);

-- 10. View útil para monitorar fila de espera
DROP VIEW IF EXISTS vw_waitlist_status CASCADE;
CREATE VIEW vw_waitlist_status AS
SELECT 
    bwl.id,
    bwl.booking_id,
    b.service_type,
    b.customer_email,
    b.customer_name,
    bwl.priority,
    bwl.reassignment_attempts,
    bwl.created_at,
    bwl.expires_at,
    EXTRACT(HOUR FROM (bwl.expires_at - CURRENT_TIMESTAMP)) as hours_until_expiry,
    bwl.status,
    CASE 
        WHEN EXTRACT(HOUR FROM (bwl.expires_at - CURRENT_TIMESTAMP)) < 0 THEN 'EXPIRADO'
        WHEN EXTRACT(HOUR FROM (bwl.expires_at - CURRENT_TIMESTAMP)) < 1 THEN 'EXPIRANDO HOJE'
        WHEN EXTRACT(HOUR FROM (bwl.expires_at - CURRENT_TIMESTAMP)) < 6 THEN 'CRÍTICO'
        WHEN bwl.reassignment_attempts > 3 THEN 'MUITAS TENTATIVAS'
        ELSE 'AGUARDANDO'
    END as urgency
FROM booking_waitlist bwl
JOIN bookings b ON bwl.booking_id = b.id
WHERE bwl.status = 'waiting'
ORDER BY bwl.priority DESC, bwl.created_at ASC;

-- 11. Função para gerar relatório de realocações
CREATE OR REPLACE FUNCTION get_reassignment_stats(p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days', p_end_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    total_bookings BIGINT,
    total_reassigned BIGINT,
    failed_allocations BIGINT,
    success_rate NUMERIC,
    avg_reassignments NUMERIC,
    avg_time_to_reassign INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT b.id)::BIGINT as total_bookings,
        COUNT(DISTINCT CASE WHEN b.status = 'reassigned' THEN b.id END)::BIGINT as total_reassigned,
        COUNT(DISTINCT CASE WHEN b.status = 'allocation_failed' THEN b.id END)::BIGINT as failed_allocations,
        ROUND(
            COUNT(DISTINCT CASE WHEN b.status = 'reassigned' THEN b.id END)::NUMERIC 
            / NULLIF(COUNT(DISTINCT b.id)::NUMERIC, 0) * 100, 2
        ) as success_rate,
        ROUND(AVG(b.reassignments_count), 2) as avg_reassignments,
        AVG(bal.timestamp - b.created_at) as avg_time_to_reassign
    FROM bookings b
    LEFT JOIN booking_audit_log bal ON b.id = bal.booking_id AND bal.action = 'reassigned'
    WHERE b.created_at::DATE BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- 12. View para auditoria de mudanças críticas
DROP VIEW IF EXISTS vw_booking_changes CASCADE;
CREATE VIEW vw_booking_changes AS
SELECT 
    bal.id,
    bal.booking_id,
    bal.action,
    bal.changed_by,
    u.full_name as changed_by_name,
    bal.timestamp,
    bal.reason,
    (bal.previous_values->>'status') as previous_status,
    (bal.new_values->>'status') as new_status,
    (bal.new_values->>'partner_id') as new_partner_id
FROM booking_audit_log bal
LEFT JOIN users u ON bal.changed_by = u.id
ORDER BY bal.timestamp DESC;

-- ============================================
-- INSTRUÇÕES DE EXECUÇÃO
-- ============================================
/*

1. BACKUP PRIMEIRO:
   pg_dump -U postgres witransfer_db > backup_$(date +%Y%m%d).sql

2. EXECUTAR ESTE ARQUIVO:
   psql -U postgres -d witransfer_db -f SCHEMA_UPDATES_NEEDED.sql

3. VERIFICAR MUDANÇAS:
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'bookings' 
   ORDER BY ordinal_position;

4. TESTAR AUDITORIA:
   INSERT INTO booking_audit_log VALUES (...);
   SELECT * FROM vw_booking_changes LIMIT 10;

5. TESTAR STATS:
   SELECT * FROM get_reassignment_stats();

6. MONITORAR WAITLIST:
   SELECT * FROM vw_waitlist_status;

*/
