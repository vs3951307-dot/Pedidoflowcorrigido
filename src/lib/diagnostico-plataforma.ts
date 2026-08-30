import { prisma } from "@/lib/prisma";
import { parseModulos } from "@/lib/modulos";
import { ativarTenant } from "@/lib/tenant-db";

export interface DiagnosticoEmpresa {
  id: string;
  nome: string;
  slug: string;
  status: string;
  plano: string;
  modulos: string[];
  online: boolean;
  ultimaAtividadeEm: Date | null;
  ultimoAcessoUsuario: Date | null;
  pedidos24h: number;
  whatsappConfigurado: boolean;
  impressaoConfigurada: boolean;
  fiscalConfigurado: boolean;
  impressaoComErro: number;
  impressaoPendenteAntiga: number;
  schemaBanco: string | null;
  bancoDedicado: boolean;
  usoIAMesAtual: number;
  limiteMensagensIA: number | null;
  problemas: string[];
  saudavel: boolean;
}

/**
 * Diagnóstico/saúde REAL da plataforma — mesma lógica usada por
 * `GET /api/superadmin/saude` e pelo Copiloto Supremo (nunca inventa
 * "está tudo bem" sem checar os dados de verdade). NUNCA expõe tokens,
 * senhas ou segredos — só booleanos/contadores derivados.
 */
export async function obterDiagnosticoPlataforma(): Promise<{
  versaoSistema: string;
  totalEmpresas: number;
  empresasComProblema: number;
  empresas: DiagnosticoEmpresa[];
}> {
  const empresas = await prisma.empresa.findMany({ orderBy: { criadoEm: "desc" } });
  const ha24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ha30min = new Date(Date.now() - 30 * 60 * 1000);

  const diagnostico = await Promise.all(
    empresas.map(async (empresa): Promise<DiagnosticoEmpresa> => {
      // Dados operacionais (pedidos, configurações, fila de impressão) vivem
      // no schema dedicado de cada tenant — ativa o tenant da empresa antes
      // de consultá-los (o diagnóstico roda fora do contexto da empresa).
      ativarTenant(empresa);
      const [
        pedidos24h,
        configWhatsapp,
        configImpressao,
        configFiscal,
        impressaoComErro,
        impressaoPendenteAntiga,
        ultimoUsuarioAtivo,
      ] = await Promise.all([
        prisma.pedido.count({ where: { empresaId: empresa.id, criadoEm: { gte: ha24h } } }),
        prisma.configuracao.findUnique({ where: { empresaId_chave: { empresaId: empresa.id, chave: "whatsapp" } } }),
        prisma.configuracao.findUnique({ where: { empresaId_chave: { empresaId: empresa.id, chave: "impressao" } } }),
        prisma.configuracao.findUnique({ where: { empresaId_chave: { empresaId: empresa.id, chave: "nfce" } } }),
        prisma.filaImpressao.count({ where: { empresaId: empresa.id, status: "erro" } }),
        prisma.filaImpressao.count({
          where: { empresaId: empresa.id, status: "pendente", criadoEm: { lt: ha30min } },
        }),
        prisma.usuario.findFirst({
          where: { empresaId: empresa.id, ultimoAcesso: { not: null } },
          orderBy: { ultimoAcesso: "desc" },
          select: { ultimoAcesso: true },
        }),
      ]);

      const whatsappConfigurado = Boolean(configWhatsapp);
      const impressaoConfigurada = Boolean(configImpressao);
      let fiscalConfigurado = false;
      if (configFiscal) {
        try {
          fiscalConfigurado = Boolean((JSON.parse(configFiscal.valor) as { provedor?: string }).provedor);
        } catch {
          fiscalConfigurado = false;
        }
      }

      const problemas: string[] = [];
      if (impressaoComErro > 0) problemas.push(`${impressaoComErro} impressão(ões) com erro`);
      if (impressaoPendenteAntiga > 0) problemas.push(`${impressaoPendenteAntiga} impressão(ões) pendente(s) há mais de 30 min (agente pode estar offline)`);
      if (empresa.status === "teste" && empresa.trialFimEm && empresa.trialFimEm < new Date()) {
        problemas.push("Período de teste expirado");
      }
      if (empresa.vencimentoEm && empresa.vencimentoEm < new Date() && empresa.status === "ativa") {
        problemas.push("Vencimento do plano ultrapassado");
      }
      return {
        id: empresa.id,
        nome: empresa.nome,
        slug: empresa.slug,
        status: empresa.status,
        plano: empresa.plano,
        modulos: parseModulos(empresa.modulos),
        online: Boolean(empresa.ultimaAtividadeEm && empresa.ultimaAtividadeEm > ha30min),
        ultimaAtividadeEm: empresa.ultimaAtividadeEm,
        ultimoAcessoUsuario: ultimoUsuarioAtivo?.ultimoAcesso ?? null,
        pedidos24h,
        whatsappConfigurado,
        impressaoConfigurada,
        fiscalConfigurado,
        impressaoComErro,
        impressaoPendenteAntiga,
        schemaBanco: empresa.schemaBanco,
        bancoDedicado: Boolean(empresa.databaseUrlSecreta),
        usoIAMesAtual: empresa.usoIAMesAtual,
        limiteMensagensIA: empresa.limiteMensagensIA,
        problemas,
        saudavel: problemas.length === 0,
      };
    })
  );

  return {
    versaoSistema: process.env.npm_package_version ?? "1.0.0",
    totalEmpresas: empresas.length,
    empresasComProblema: diagnostico.filter((d) => !d.saudavel).length,
    empresas: diagnostico,
  };
}
