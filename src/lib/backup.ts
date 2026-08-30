import { prisma, plataformaPrisma } from "@/lib/prisma";
import { ativarTenant } from "@/lib/tenant-db";
import { salvarArquivoPrivado } from "@/lib/storage";

/** Versão do FORMATO do backup — o restore recusa versões que não sabe interpretar. */
export const VERSAO_BACKUP = 2;

function formatoTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ResultadoBackup {
  ok: boolean;
  backupId?: string;
  tamanho?: string;
  destino?: string;
  erro?: string;
}

/**
 * Gera um backup COMPLETO da empresa (PEDIDO 29) e salva no storage
 * persistente (PEDIDO 28). Extraído de `POST /api/backups` para ser
 * reaproveitado também no arquivamento de empresa pelo Super Admin
 * (PEDIDO 71 — "antes de destruição: backup/export obrigatório").
 *
 * CORREÇÃO (PEDIDO 5 — bloqueador real): antes, esta função assumia que
 * o CHAMADOR já tinha ativado o tenant certo — verdade quando chamada
 * pela rota da própria empresa (`autorizar("backups")` já ativa),
 * FALSO quando chamada pelo arquivamento de empresa do Super Admin
 * (`autorizarSuperAdmin()` NUNCA ativa tenant nenhum). Nesse segundo
 * caso, todo `prisma.cliente`/`prisma.pedido`/etc. abaixo lançava erro
 * imediato (nenhum tenant ativo) — ou, pior, se por acaso outro tenant
 * estivesse ativo no mesmo processo por outro motivo, o backup sairia
 * com dados da empresa ERRADA. Agora a função é AUTOSSUFICIENTE: busca
 * a Empresa (modelo de plataforma, sempre acessível) e ativa o tenant
 * dela explicitamente, sempre, não importa quem chamou.
 */
export async function gerarBackupCompleto(
  empresaId: string,
  tipo: "manual" | "automatico"
): Promise<ResultadoBackup> {
  const empresaPlataforma = await plataformaPrisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, schemaBanco: true, databaseUrlSecreta: true, slug: true },
  });
  if (!empresaPlataforma) {
    return { ok: false, erro: "Empresa não encontrada." };
  }
  // Ativa o tenant CERTO antes de qualquer consulta abaixo — nunca
  // confia que o chamador já fez isso.
  ativarTenant(empresaPlataforma);

  const nomeArquivo = `pedidoflow-${empresaId}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;

  try {
    const [
      empresa,
      usuarios,
      permissoes,
      clientes,
      categorias,
      produtos,
      sabores,
      tamanhos,
      adicionais,
      mesas,
      pedidos,
      caixas,
      movimentacoesCaixa,
      estoqueProdutos,
      movimentacoesEstoque,
      notasFiscais,
      entregadores,
      entregas,
      configuracoes,
      conversasWhatsApp,
      mensagensWhatsApp,
      impressoras,
    ] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId } }),
      prisma.usuario.findMany({ where: { empresaId }, select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true } }),
      prisma.permissaoUsuario.findMany({ where: { usuario: { empresaId } } }),
      prisma.cliente.findMany({ where: { empresaId }, include: { enderecos: true } }),
      prisma.categoria.findMany({ where: { empresaId } }),
      prisma.produto.findMany({ where: { empresaId }, include: { sabores: true } }),
      prisma.sabor.findMany({ where: { empresaId } }),
      prisma.tamanho.findMany({ where: { empresaId }, include: { precos: true } }),
      prisma.adicional.findMany({ where: { empresaId } }),
      prisma.mesa.findMany({ where: { empresaId } }),
      prisma.pedido.findMany({
        where: { empresaId },
        include: { itens: true, pagamentos: true, documentoFiscal: true },
        take: 5000,
        orderBy: { criadoEm: "desc" },
      }),
      prisma.caixa.findMany({ where: { empresaId }, take: 500, orderBy: { abertoEm: "desc" } }),
      prisma.movimentacaoCaixa.findMany({ where: { empresaId }, take: 10000, orderBy: { criadoEm: "desc" } }),
      prisma.estoqueProduto.findMany({ where: { empresaId } }),
      prisma.movimentacaoEstoque.findMany({ where: { empresaId }, take: 10000, orderBy: { criadoEm: "desc" } }),
      prisma.notaFiscal.findMany({ where: { empresaId }, take: 2000, orderBy: { criadoEm: "desc" } }),
      prisma.entregador.findMany({ where: { empresaId } }),
      prisma.entrega.findMany({ where: { empresaId }, take: 5000, orderBy: { criadoEm: "desc" } }),
      prisma.configuracao.findMany({ where: { empresaId } }),
      prisma.conversaWhatsApp.findMany({ where: { empresaId }, take: 2000, orderBy: { criadoEm: "desc" } }),
      prisma.mensagemWhatsApp.findMany({ where: { conversa: { empresaId } }, take: 20000, orderBy: { criadoEm: "desc" } }),
      prisma.impressora.findMany({ where: { empresaId } }),
    ]);

    if (!empresa) {
      return { ok: false, erro: "Empresa não encontrada." };
    }

    const snapshot = {
      versao: VERSAO_BACKUP,
      empresaId,
      geradoEm: new Date().toISOString(),
      empresa,
      usuarios,
      permissoes,
      clientes,
      categorias,
      produtos,
      sabores,
      tamanhos,
      adicionais,
      mesas,
      pedidos,
      caixas,
      movimentacoesCaixa,
      estoqueProdutos,
      movimentacoesEstoque,
      notasFiscais,
      entregadores,
      entregas,
      configuracoes,
      conversasWhatsApp,
      mensagensWhatsApp,
      impressoras,
    };
    const conteudo = JSON.stringify(snapshot, null, 2);

    const { destino } = await salvarArquivoPrivado("backups", nomeArquivo, conteudo);
    const tamanho = formatoTamanho(Buffer.byteLength(conteudo, "utf-8"));
    const destinoTexto = destino === "supabase" ? `Supabase Storage (backups/${nomeArquivo})` : `Arquivo local (prisma/backups/${nomeArquivo})`;

    const backup = await prisma.backup.create({
      data: {
        empresaId,
        data: new Date(),
        tipo,
        tamanho,
        destino: destinoTexto,
        caminhoArquivo: nomeArquivo,
        versaoFormato: VERSAO_BACKUP,
        status: "concluido",
      },
    });

    return { ok: true, backupId: backup.id, tamanho, destino: destinoTexto };
  } catch (err) {
    await prisma.backup
      .create({
        data: { empresaId, data: new Date(), tipo, tamanho: "—", destino: "falhou antes de salvar", status: "falhou" },
      })
      .catch(() => undefined);
    console.error("Falha ao gerar backup:", err);
    return { ok: false, erro: "Não foi possível gerar o backup. Verifique a configuração de storage." };
  }
}
