import { NextRequest, NextResponse } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { lerConfigNfceBanco, salvarConfigNfceBanco, statusConfiguracaoFiscal } from "@/lib/fiscal/config";
import { validarCorpo } from "@/lib/validar";
import { fiscalConfigSalvarSchema } from "@/lib/schemas/fiscal";
import { mascararSegredo } from "@/lib/crypto-segredos";

/**
 * GET /api/fiscal/config — estado público da configuração fiscal DESTA
 * empresa: ambiente efetivo, provedor e o que falta para a emissão real,
 * mais os dados cadastrais (não sensíveis) já salvos. NUNCA expõe
 * segredos em texto puro (token, senha do certificado, CSC completo) —
 * só uma versão mascarada, para o Administrador confirmar que já
 * cadastrou algo sem precisar ver o valor de novo.
 */
async function GETTenant() {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  const [status, banco] = await Promise.all([
    statusConfiguracaoFiscal(acesso.empresaId),
    lerConfigNfceBanco(acesso.empresaId),
  ]);
  return NextResponse.json({
    config: status,
    cadastro: {
      cnpj: banco.cnpj ?? "",
      inscricaoEstadual: banco.inscricaoEstadual ?? "",
      razaoSocial: banco.razaoSocial ?? "",
      nomeFantasia: banco.nomeFantasia ?? "",
      enderecoFiscal: banco.enderecoFiscal ?? "",
      regimeTributario: banco.regimeTributario ?? "",
      cscMascarado: banco.csc ? mascararSegredo(banco.csc) : null,
      tokenProvedorMascarado: banco.tokenProvedor ? mascararSegredo(banco.tokenProvedor) : null,
      certificadoConfigurado: Boolean(banco.certificadoBase64),
      certificadoSenhaConfigurada: Boolean(banco.certificadoSenha),
    },
  });
}

/**
 * PUT /api/fiscal/config — salva os dados fiscais desta empresa
 * (Configurações → Fiscal/NFC-e). Campos de credencial em branco
 * MANTÊM o valor já salvo (não é preciso recadastrar tudo a cada
 * edição) — só sobrescreve quando um novo valor não-vazio é enviado.
 * Restrito ao Administrador.
 */
async function PUTTenant(req: NextRequest) {
  const acesso = await autorizar("fiscal");
  if (!acesso.ok) return acesso.resposta;
  if (acesso.usuario.papel !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Somente o administrador pode alterar dados fiscais." }, { status: 403 });
  }

  const corpoBruto = await req.json().catch(() => ({}));
  const validado = validarCorpo(fiscalConfigSalvarSchema, corpoBruto);
  if (!validado.ok) return validado.resposta;
  const dados = validado.dados;

  // Remove campos de credencial vazios do payload — `salvarConfigNfceBanco`
  // já mescla com o valor atual, então "não enviar" preserva o que
  // já estava lá; não queremos que uma string vazia APAGUE um segredo
  // já cadastrado sem intenção explícita.
  const paraSalvar: Record<string, unknown> = { ...dados };
  for (const campo of ["csc", "cscId", "tokenProvedor", "certificadoBase64", "certificadoSenha"] as const) {
    if (paraSalvar[campo] === "") delete paraSalvar[campo];
  }

  await salvarConfigNfceBanco(acesso.empresaId, paraSalvar);
  await registrarAuditoria(
    "fiscal_config_atualizada",
    "Dados fiscais/credenciais atualizados",
    acesso.usuario,
    undefined,
    acesso.empresaId
  );

  return NextResponse.json({ ok: true });
}

export const GET = comTratamentoDeErro("fiscal.config.GET", GETTenant);
export const PUT = comTratamentoDeErro("fiscal.config.PUT", PUTTenant);
