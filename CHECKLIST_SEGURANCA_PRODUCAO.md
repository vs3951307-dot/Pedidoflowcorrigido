# CHECKLIST DE SEGURANÇA PARA PRODUÇÃO - PedidoFlow SaaS

## 🛡️ ETAPA 1: CONFIRA DEPOIS DE DEPLOY NA VPS COM DOMÍNIO PRÓPRIO

### 1.1. Configuração de Domínio e SSL
- [ ] Domínio próprio apontado para a IP da VPS (DNS configurado)
- [ ] Certificado SSL/TLS válido (Let's Encrypt ou certificado próprio)
- [ ] HTTPS forçado em todas as rotas (`redirectHTTPToHTTPS`)
- [ ] HSTS header configurado (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)

### 1.2. Nginx / Reverse Proxy
- [ ] Nginx ou Apache como reverse proxy na porta 80/443
- [ ] Proxy para a porta do Node.js (ex.: `localhost:3000`)
- [ ] Configuração de `server_names_hash_bucket_size 64`
- [ ] Configuração de `large_client_header_buffers`
- [ ] Keepalive connections para performance

### 1.3. Firewall
- [ ] Portas necessárias abertas:
  - Porta 80 (HTTP) e 443 (HTTPS)
  - Porta 22 (SSH) - restrito a IPs autorizados somente
  - Porta 5432 (PostgreSQL) - NUNCA exposto publicamente, apenas via tunnel ou VPC
- [ ] Firewall do sistema operacional (UFW/iptables) configurado
- [ ] Grupos de segurança da nuvem (AWS Security Groups, etc.)

### 1.4. Sistema Operacional
- [ ] Sistema atualizado (`apt update && apt upgrade` / `yum update`)
- [ ] Senhas fortes para todos os usuários do sistema
- [ ] Usuário root com login desabilitado ou com chave SSH só
- [ ] Fail2ban instalado para bloqueio de IPs maliciosos
- [ ] Swap configurado adequadamente para o Node.js

---

### 🔐 ETAPA 2: AUTENTICAÇÃO E SESSÃO

#### 2.1. Autenticação
- [ ] Tente-a-bruta desabilitada ou com lockout rigoroso (já implementado: 5 tentativas/min, lockout 15 min após 10 falhas)
- [ ] Senhas com política forte (mínimo 8 caracteres, mix de tipos)
- [ ] Senhas nunca salhas em texto puro (bcrypt com factor de custo adequado - já usa bcryptjs)
- [ ] Multi-factor authentication (MFA) opcional para administradores

#### 2.2. Sessão e Cookies
- [ ] Cookies httpOnly (já implementado no `/api/auth/login`)
- [ ] Cookies sameSite=lax (já implementado)
- [ ] Cookie expiry de 7 dias (já implementado)
- [ ] Secure flag em produção (`secure: process.env.NODE_ENV === "production"` - já implementado)
- [] Renovação de sessão antes do expirar (refresh token opcional)

#### 2.2. Rate Limiting
- [ ] Rate limit global configurado no Nginx (ex.: 100 requisições/minuto por IP)
- [ ] Rate limit já implementado na aplicação:
  - Login: 5 tentativas/minuto (`/api/auth/login`)
  - Recuperação de senha: 3 tentativas/minuto (`/api/auth/recuperar`)
  - Reset de senha: 5 tentativas/minuto (`/api/auth/redefinir`)
- [ ] Limitadores por endpoint crítico adicionais

---

### 🛡️ ETAPA 3: PROTEÇÃO DE APIs E ENDPOINTS

#### 3.1. Proteção de APIs
- [ ] Todas as APIs validam sessão (`exigirRota("admin")`, `autorizar("admin", "entregas")`)
- [ ] `empresaId` vem SEMPRE da sessão, NUNCA do corpo/querystring/headers
- [ ] Validação de `status` da empresa (`ativa` ou `teste` apenas)
- [ ] Trial vencido e assinatura vencida bloqueiam acesso

#### #### 3.2. RLS / Multi-tenant
- [ ] Isolamento por `empresaId` em TODAS as queries Prisma
- [ ] Isolamento por schema PostgreSQL (já estrutural no schema.prisma)
- [ ] Nenhuma query busca "em todas as empresas" acidentalmente
- [ ] Dados sensíveis (tokens, senhas) NUNCA expostos entre empresas

#### #### 3.3. Validação de entrada
- [ ] Todas as APIs validam tipos de dados entrantes
- [ ] SQL injection protegido pelo Prisma (parametrizadas)
- [ ] XSS protegido (validações de campo, Content-Type checado)
- [ ] Tamanho máximo de payloads (ex.: `limite de 10MB` no Nginx)

---

### 👑 ETAPA 3: SUPER ADMIN E ADMINISTRADOR

#### 4.1. Super Admin
- [ ] Conta Super Admin totalmente isolada (não usa `autorizar("admin", ...)`)
- [ ] Endpoints de Super Admin exigem token separado ou auth header diferente
- [ ] Ações de Super Admin (criar apagar usuarios, alterar plano) logadas integralmente
- [ ] Nenhum usuário comum (mesmo ADMINISTRADOR) tem acesso a ops de Super Admin

#### #### 4.2. Admin por empresa
- [ ] Administrador só vê/acessa sua empresa (`empresaId` da sessão)
- [ ] `exigirRota("admin")` bloqueia entregadores e caixas
- [ ] Módulos contratados pelo empresa definem o que o admin vê no menu
- [ ] `parseModulos(usuario.empresa.modulos)` filtra módulos disponíveis

---

### 🌐 ETAPA 4: HEADERS HTTP E CONFIGURAÇÕES DE SEGURANÇA

#### 5.1. Headers de Segurança (via Nginx ou middleware)
- [ ] `X-Content-Type-Options: nosniff` (impede MIME-type sniffing)
- [ ] `X-Frame-Options: DENY` ou `SAMEORIGIN` (protege contra clickjacking)
- [ ] `X-XSS-Protection: 1; mode=block` (proteção legacy de XSS nos browsers)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Content-Security-Policy` (CSP) basic:
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline'; (ajustar depois)
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self';
  font-src 'self';
  frame-ancestors 'none';
  ```

#### #### 5.2. Headers Adicionais
- [ ] `Strict-Transport-Security` (HSTS)
- [ ] `Cache-Control: no-store` em rotas de auth (login, logout, password reset)
- [ ] `Pragma: no-store`

---

### 📊 ETAPA 5: MONITORAMENTO E AUDITORIA

#### 6.1. Logs de Segurança
- [ ] Todos os eventos de login (sucesso/falha) salvos em log estruturado
- [ ] Tentativas de lockout registradas
- [ ] Eventos de password reset registrados
- [ ] Acessos não autorizados registrados
- [ ] Logs enviados para serviço externo (Datadog, New Relic, ou simples arquivo em disco)

#### #### 6.2. Monitoramento
- [ ] Monitoramento de taxas de erro 401/403
- [ ] Alertas de múltiplas falhas de login
- [ ] Monitoramento de uso de endpoint sensíveis
- [ ] Health checks para a aplicação

---

### 🔧 ETAPA 6: CONFIGURAÇÕES ADICIONAIS

#### 7.1. Backup e Recuperação
- [ ] Backups diários do banco de dados PostgreSQL
- [ ] Backups incrementais
- [ ] Testes periódicos de restauração
- [ ] Backup do código-fonte e configurações

#### #### 7.2. API External
- [ ] Chaves API (WhatsApp, Resend, provedores) nunca hardcoded no código
- [ ] Variáveis de ambiente protegidas (`/.env.production` com restrições)
- [ ] Rotacionamento de chaves periódicas

#### #### 7.2. DNS e Subdomínios
- [ ] Subdomínios isolados por ambiente (dev, staging, prod)
- [ ] DNS records válidos e monitorados
- [ ] DNSSEC configurado se possível

---

## 📋 RESUMO EXECUTIVO

### Segurança já implementada no código:
- ✅ Rate limiting em login, recuperação e reset de senha
- ✅ Lockout de conta após 10 falhas consecutivas
- ✅ Mensagens de erro genéricas (não revela se e-mail existe)
- ✅ Sessões httpOnly com expiração de 7 dias
- ✅ Bcrypt para hashing de senhas
- ✅ Token de recuperação de senha com expiração de 30 min
- ✅ Revogação de todas as sessões após reset de senha
- ✅ Role-based access control (RBAC) com overrides por usuário
- ✅ Resource-level permissions
- ✅ Audit logging de todas as ações de auth
- ✅ Isolamento multi-tenant por empresaId e schemas PostgreSQL
- ✅ Validação genérica de erros (não enumera emails)
- ✅ User agent capture em sessões

### Próximos passos (após deploy na VPS):
1. Configurar Nginx como reverse proxy com headers de segurança
2. Configurar SSL/Let's Encrypt
3. Configurar firewall do sistema e da nuvem
4. Configurar monitoramento e logs
5. Testar todas as vulnerabilidades com ferramentas (OWASP ZAP, etc.)
6. Implementar CSP (Content Security Policy)
7. Rotacionar chaves de API periodicamente

---

**Este checklist deve ser executado sempre após o deploy em produção e antes de colocar o sistema ao vivo com usuários reais.**

---

*Documento gerado automaticamente após a implementação das correções de segurança globais do PedidoFlow SaaS.*