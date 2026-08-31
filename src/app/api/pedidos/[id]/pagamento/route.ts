import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { emitirMudancaKds } from "@/lib/kds-eventos";
import { enfileirarAutomatica, gerarConteudoCupom, referenciaPedido, lerImpressoras, destinoRealDoTipo } from "@/lib/impressao";
import { emitirNFCeParaPedido } from "@/lib/fiscal/emissao";
import { lerConfigNfceBanco } from "@/lib/fiscal/config";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { registrarPagamento } from "@/lib/pagamentos/registrar-pagamento";

/**
 * Confirma um pagamento (parcial ou total) de um pedido/mesa e registra
 * a venda no caixa. Suporta CONTA DIVIDIDA: várias chamadas com valores
 * parciais e formas diferentes até a soma cobrir o total — só quando a
 * soma bate o total é que o(s) pedido(s) são finalizados e saem da
 * produção. Regra de negócio validada no servidor: pagamento em
 * dinheiro exige caixa aberto.
 *
 * Toda a regra (validação, trava de concorrência da conta, idempotência,
 * saldo, movimentação de caixa) está em
 * `src/lib/pagamentos/registrar-pagamento.ts` — função sem HTTP,
 * exercitada por testes de concorrência contra um PostgreSQL real. Esta
 * rota autoriza, chama e cuida só dos efeitos colaterais pós-venda
 * (impressão do cupom e emissão de NFC-e).
 */
export const POST = comTratamentoDeErro("pedidos.pagamento.POST", async (req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("pagamentos");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;

  const corpo = await req.json().catch(() => ({}));

  const resultado = await registrarPagamento(empresaId, acesso.usuario, params.id, corpo);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
  }

  const { pagamento, pedido, quitado, saldoRestante, totalConta, idempotente } = resultado;

  // Aviso em tempo real (KDS/pedido). Em try/catch: a venda já foi paga e
  // registrada no banco — uma falha no aviso (ex.: listener SSE lançando)
  // não pode transformar um pagamento já confirmado num 500.
  if (quitado && !idempotente) {
    try {
      emitirMudancaKds(empresaId);
    } catch (erroKds) {
      console.warn(`Aviso de mudança KDS falhou para o pedido ${pedido.id} (venda já confirmada):`, erroKds);
    }
  }

  // Impressão automática do cupom do cliente (PEDIDO 16) — só quando a
  // conta é quitada de fato (impressão parcial não faz sentido aqui) E
  // esta não é uma chamada idempotente repetida (retry não pode
  // reimprimir/reemitir o que a tentativa original já disparou).
  if (quitado && !idempotente) {
    try {
      const conteudo = await gerarConteudoCupom(empresaId, pedido.numero);
      if (conteudo) {
        const impressoras = await lerImpressoras(empresaId);
        await enfileirarAutomatica(empresaId, {
          tipo: "cupom",
          destino: destinoRealDoTipo("cupom", impressoras),
          referencia: referenciaPedido(pedido.numero),
          conteudo,
        });
      }
    } catch (erroImpressao) {
      console.warn(`Impressão do cupom falhou para o pedido ${pedido.id} (venda já confirmada):`, erroImpressao);
    }
  }

  // NFC-e (PEDIDO 19): emite quando configurado p/ emissão automática, e
  // só quando a conta foi quitada (nunca emite nota de uma conta parcial).
  // O documento fiscal da venda é SEMPRE criado (registro vinculado);
  // sem configuração fica "nao_configurado" — nunca se simula sucesso.
  let fiscal: Record<string, unknown> | null = null;
  if (quitado && !idempotente) {
    try {
      const configNfce = await lerConfigNfceBanco(empresaId);
      if (configNfce.emitirAutomatico) {
        const { resultado: resultadoFiscal, documentoId } = await emitirNFCeParaPedido(empresaId, pedido.id, {
          usuario: { id: acesso.usuario.id, nome: acesso.usuario.nome },
        });
        fiscal = {
          documentoId,
          status: resultadoFiscal.status,
          erro: resultadoFiscal.erro ?? null,
          retorno: resultadoFiscal.retorno ?? null,
        };
      }
    } catch (erroEmissao) {
      // Falha de emissão não deve derrubar a venda já paga — fica registrada
      // no documento (pendente/erro) para re-tentativa manual no Admin.
      console.warn(`Emissão NFC-e falhou para o pedido ${pedido.id}:`, erroEmissao);
    }
  }

  // Carregar os dados da empresa para o cupom do cliente. A venda já
  // está paga — uma falha nesta consulta de apoio não pode derrubar a
  // resposta (o restante do cupom é montado no cliente sem este bloco).
  let empresaRegistro: { valor: string } | null = null;
  try {
    empresaRegistro = await prisma.configuracao.findUnique({
      where: { empresaId_chave: { empresaId, chave: "empresa" } },
      select: { valor: true },
    });
  } catch (erroConfig) {
    console.warn(`Leitura dos dados da empresa falhou para o pedido ${pedido.id}:`, erroConfig);
  }
  let empresa: Record<string, string> | null = null;
  if (empresaRegistro) {
    try {
      empresa = JSON.parse(empresaRegistro.valor) as Record<string, string>;
    } catch {
      empresa = null;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      idempotente,
      pagamento,
      quitado,
      saldoRestante,
      totalConta,
      fiscal,
      empresa: empresa
        ? {
            razaoSocial: empresa.razaoSocial ?? "",
            nomeFantasia: empresa.nomeFantasia ?? "",
            cnpj: empresa.cnpj ?? "",
            rua: empresa.rua ?? "",
            cidade: empresa.cidade ?? "",
            uf: empresa.uf ?? "",
            telefone: empresa.telefone ?? "",
          }
        : null,
    },
    { status: resultado.status }
  );
});
