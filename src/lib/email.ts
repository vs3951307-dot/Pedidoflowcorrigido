/**
 * Envio de e-mail via Resend — API HTTP direta (`fetch`), sem SDK do
 * pacote `resend`. Decisão deliberada: este ambiente de build não tem
 * acesso à internet para `npm install` um pacote novo; a API HTTP do
 * Resend é simples o bastante para não precisar do SDK, e o resultado é
 * idêntico do ponto de vista de quem usa `enviarEmail()`. Se no futuro
 * quiserem trocar para o SDK oficial, é só reescrever o corpo desta
 * função — a assinatura pode continuar igual.
 *
 * Variáveis de ambiente (globais da instância — recuperação de senha não
 * é uma operação "por empresa"):
 *   RESEND_API_KEY — chave da API do Resend. Sem ela, `enviarEmail()`
 *     não lança erro: registra no log que o envio está desativado e
 *     devolve `{ enviado: false, motivo: "sem_configuracao" }`. Quem
 *     chama decide o que fazer (ex.: no fluxo de demonstração, devolver
 *     o link na resposta da API em vez do e-mail).
 *   EMAIL_FROM — remetente (ex.: "PedidoFlow <nao-responda@pedidoflow.app>").
 *   APP_URL — origem pública usada para montar links nos e-mails
 *     (ex.: "https://app.pedidoflow.com.br").
 */

const RESEND_API = "https://api.resend.com/emails";

export interface ResultadoEnvioEmail {
  enviado: boolean;
  motivo?: "sem_configuracao" | "falha_provedor";
  /** Detalhe técnico (nunca exposto ao usuário final, só para log/depuração). */
  detalhe?: string;
}

export function emailConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/** Base pública da aplicação para montar links em e-mails (com fallback sensato em dev). */
export function urlBase(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function enviarEmail(params: {
  para: string;
  assunto: string;
  html: string;
  /** Rótulo curto usado só no log (ex.: "recuperacao-senha") — nunca inclui dado sensível. */
  contexto: string;
}): Promise<ResultadoEnvioEmail> {
  if (!emailConfigurado()) {
    // Log deliberadamente genérico: confirma que o e-mail NÃO foi enviado
    // e por quê, sem nunca imprimir o conteúdo (e portanto nunca o token)
    // no console. Isto é o que a PEDIDO 1 chama de "mostrar claramente
    // que o envio está desativado" sem quebrar o resto do fluxo.
    console.warn(`[email] envio desativado (RESEND_API_KEY/EMAIL_FROM ausentes) — contexto: ${params.contexto}`);
    return { enviado: false, motivo: "sem_configuracao" };
  }

  try {
    const resposta = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [params.para],
        subject: params.assunto,
        html: params.html,
      }),
    });

    if (!resposta.ok) {
      // Nunca logar `params.para` nem o html (poderia conter token) —
      // só o status HTTP e o contexto, suficiente para diagnosticar sem
      // vazar dado sensível em log.
      const corpo = await resposta.text().catch(() => "");
      console.error(`[email] falha ao enviar (contexto: ${params.contexto}, HTTP ${resposta.status})`);
      return { enviado: false, motivo: "falha_provedor", detalhe: corpo.slice(0, 300) };
    }
    return { enviado: true };
  } catch (erro) {
    console.error(`[email] erro de rede ao enviar (contexto: ${params.contexto})`, erro instanceof Error ? erro.message : erro);
    return { enviado: false, motivo: "falha_provedor" };
  }
}

/**
 * E-mail de recuperação de senha (PEDIDO 1). O link já inclui o token —
 * por isso o CONTEÚDO do e-mail nunca é logado (só o fato de ter sido
 * enviado ou não), em nenhum ambiente, produção ou não.
 */
export async function enviarEmailRecuperacaoSenha(params: {
  para: string;
  nomeUsuario: string;
  nomeEmpresa: string;
  linkRedefinir: string;
  validadeMinutos: number;
}): Promise<ResultadoEnvioEmail> {
  const html = `
  <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
    <p style="font-size: 20px; font-weight: 700; color: #953C2A; margin: 0 0 24px;">PedidoFlow</p>
    <p style="margin: 0 0 16px;">Olá, ${escaparHtml(params.nomeUsuario)}.</p>
    <p style="margin: 0 0 16px;">
      Recebemos uma solicitação para redefinir sua senha no PedidoFlow
      (${escaparHtml(params.nomeEmpresa)}).
    </p>
    <p style="margin: 0 0 24px;">Clique no botão abaixo para criar uma nova senha.</p>
    <p style="margin: 0 0 24px;">
      <a href="${params.linkRedefinir}"
         style="display:inline-block; background:#953C2A; color:#fff; text-decoration:none; padding:12px 24px; border-radius:10px; font-weight:600;">
        Redefinir minha senha
      </a>
    </p>
    <p style="margin: 0 0 8px; font-size: 14px; color: #666;">
      Este link é válido por ${params.validadeMinutos} minutos e só pode ser usado uma vez.
    </p>
    <p style="margin: 0; font-size: 14px; color: #666;">
      Se você não solicitou esta alteração, ignore este e-mail — sua senha continua a mesma.
    </p>
  </div>`.trim();

  return enviarEmail({
    para: params.para,
    assunto: "Redefinir sua senha — PedidoFlow",
    html,
    contexto: "recuperacao-senha",
  });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
