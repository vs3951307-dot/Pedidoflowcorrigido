import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Storage persistente (PEDIDO 26: "armazenamento de imagens não pode ser
 * disco local... Deploy ou restart pode apagar arquivos").
 *
 * Usa Supabase Storage via API REST direta (`fetch`) — sem instalar o
 * SDK `@supabase/supabase-js` (não consigo baixar pacotes novos neste
 * ambiente de qualquer forma; a API REST cobre upload/remoção/URL
 * assinada, que é tudo que este projeto precisa).
 *
 * Configuração (`.env`):
 *   SUPABASE_URL               — URL do projeto (ex.: https://xxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY  — chave de serviço (NUNCA exposta ao
 *                                 frontend — só usada aqui, server-side)
 *
 * Sem as duas configuradas:
 *   - Em desenvolvimento (`NODE_ENV !== "production"`): cai para disco
 *     local (`public/uploads/`), como já era — serve pra rodar localmente
 *     sem precisar de conta Supabase.
 *   - Em produção: lança erro claro em vez de gravar em disco efêmero
 *     silenciosamente (PEDIDO 26 — nunca depender de disco local em
 *     produção, nem por omissão de configuração).
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function storagePersistenteConfigurado(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY;
}

function ehProducao(): boolean {
  return process.env.NODE_ENV === "production";
}

export interface ResultadoUpload {
  /** Caminho público (URL completa se Supabase; caminho relativo a `/` se disco local). */
  url: string;
  /** Onde foi salvo de fato — útil pra diagnóstico/log, não pra lógica. */
  destino: "supabase" | "disco_local";
}

/**
 * Salva um arquivo num bucket PÚBLICO (leitura sem autenticação — usado
 * para fotos de produto/estoque, exibidas no cardápio/PDV sem login).
 */
export async function salvarArquivoPublico(
  bucket: string,
  caminho: string,
  bytes: Buffer,
  mime: string
): Promise<ResultadoUpload> {
  if (storagePersistenteConfigurado()) {
    const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${caminho}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY ?? "",
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true", // sobrescreve se já existir (troca de foto)
      },
      body: new Uint8Array(bytes),
    });
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(`Falha ao enviar arquivo para o Supabase Storage (HTTP ${resposta.status}): ${corpo.slice(0, 300)}`);
    }
    return {
      url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${caminho}?v=${Date.now()}`,
      destino: "supabase",
    };
  }

  if (ehProducao()) {
    throw new Error(
      "Storage persistente não configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes) — " +
        "em produção, uploads não podem ser gravados em disco local (some no próximo deploy/restart)."
    );
  }

  // Desenvolvimento sem Supabase: fallback local, como já era.
  const dir = path.join(process.cwd(), "public", "uploads", bucket, path.dirname(caminho));
  await mkdir(dir, { recursive: true });
  const arquivo = path.join(process.cwd(), "public", "uploads", bucket, caminho);
  await writeFile(arquivo, bytes);
  return { url: `/uploads/${bucket}/${caminho}?v=${Date.now()}`, destino: "disco_local" };
}

/** Remove um arquivo de um bucket público (silencioso se não existir). */
export async function removerArquivoPublico(bucket: string, caminho: string): Promise<void> {
  if (storagePersistenteConfigurado()) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${caminho}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${SUPABASE_KEY}` },
    }).catch(() => {});
    return;
  }
  const arquivo = path.join(process.cwd(), "public", "uploads", bucket, caminho);
  await unlink(arquivo).catch(() => {});
}

/**
 * Salva num bucket PRIVADO (nunca legível sem URL assinada — usado para
 * backups, PEDIDO 28: "backups não podem ficar somente no disco").
 */
export async function salvarArquivoPrivado(bucket: string, caminho: string, conteudo: string): Promise<{ destino: "supabase" | "disco_local" }> {
  const bytes = Buffer.from(conteudo, "utf-8");
  if (storagePersistenteConfigurado()) {
    const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${caminho}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "x-upsert": "true" },
      body: new Uint8Array(bytes),
    });
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(`Falha ao enviar backup para o Supabase Storage (HTTP ${resposta.status}): ${corpo.slice(0, 300)}`);
    }
    return { destino: "supabase" };
  }
  if (ehProducao()) {
    throw new Error(
      "Storage persistente não configurado — em produção, backups não podem ser gravados em disco local."
    );
  }
  const dir = path.join(process.cwd(), "prisma", "backups");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, caminho), bytes);
  return { destino: "disco_local" };
}

/**
 * Salva bytes binários num bucket PRIVADO (nunca legível sem URL assinada
 * — usado para documentos do Copiloto: nota fiscal em PDF/foto, áudios).
 * É a versão binária de `salvarArquivoPrivado` (que só grava texto UTF-8,
 * suficiente para backups). Supabase recebe os bytes crus; o fallback
 * local grava em `prisma/documentos/` (fora de `public/`, então nunca
 * servido como arquivo estático — o acesso é sempre via endpoint com
 * autorização, ver /api/copiloto/anexo).
 */
export async function salvarArquivoPrivadoBytes(
  bucket: string,
  caminho: string,
  bytes: Buffer,
  mime: string
): Promise<{ destino: "supabase" | "disco_local" }> {
  if (storagePersistenteConfigurado()) {
    const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${caminho}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY ?? "",
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: new Uint8Array(bytes),
    });
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(`Falha ao enviar documento para o Supabase Storage (HTTP ${resposta.status}): ${corpo.slice(0, 300)}`);
    }
    return { destino: "supabase" };
  }
  if (ehProducao()) {
    throw new Error(
      "Storage persistente não configurado — em produção, documentos não podem ser gravados em disco local."
    );
  }
  const dir = path.join(process.cwd(), "prisma", "documentos", bucket, path.dirname(caminho));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), "prisma", "documentos", bucket, caminho), bytes);
  return { destino: "disco_local" };
}

/** Remove um arquivo de um bucket privado (silencioso se não existir). */
export async function removerArquivoPrivadoBytes(bucket: string, caminho: string): Promise<void> {
  if (storagePersistenteConfigurado()) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${caminho}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${SUPABASE_KEY}` },
    }).catch(() => {});
    return;
  }
  const arquivo = path.join(process.cwd(), "prisma", "documentos", bucket, caminho);
  await unlink(arquivo).catch(() => {});
}

/**
 * Lê bytes de um arquivo de um bucket privado — usado no fallback de
 * desenvolvimento (disco local) para servir o arquivo via endpoint
 * autorizado. Retorna `null` se o arquivo não existir.
 */
export async function lerArquivoPrivadoBytes(bucket: string, caminho: string): Promise<Buffer | null> {
  const arquivo = path.join(process.cwd(), "prisma", "documentos", bucket, caminho);
  const { readFile } = await import("node:fs/promises");
  return readFile(arquivo).catch(() => null);
}

/** Lê o conteúdo de um arquivo de um bucket privado (usado no restore). */
export async function lerArquivoPrivado(bucket: string, caminho: string): Promise<string> {
  if (storagePersistenteConfigurado()) {
    const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${caminho}`, {
      headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!resposta.ok) {
      throw new Error(`Arquivo não encontrado no Supabase Storage (HTTP ${resposta.status}).`);
    }
    return resposta.text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(process.cwd(), "prisma", "backups", caminho), "utf-8");
}

/** Gera uma URL assinada temporária pra baixar um arquivo privado (ex.: backup). */
export async function gerarUrlAssinada(bucket: string, caminho: string, expiraSegundos = 300): Promise<string | null> {
  if (!storagePersistenteConfigurado()) return null; // disco local não tem URL assinada — baixa via endpoint próprio
  const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${caminho}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: expiraSegundos }),
  });
  if (!resposta.ok) return null;
  const dados = await resposta.json().catch(() => null);
  return dados?.signedURL ? `${SUPABASE_URL}/storage/v1${dados.signedURL}` : null;
}
