"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/lib/api-cliente";
import { EMPRESA_DADOS, type EmpresaDados } from "@/lib/configuracoes";

interface ConfiguracoesApi {
  // GET /api/configuracoes devolve um objeto plano de chaves/valor
  // (Record<chave, valor>). A empresa pode vir agrupada (dados.config.empresa)
  // ou plana (dados.empresa) — aceitamos AMBOS para a tela não quebrar.
  config?: {
    empresa?: EmpresaDados;
  };
  empresa?: EmpresaDados;
  [chave: string]: unknown;
}

function Campo({
  rotulo,
  valor,
  onChange,
  tipo = "text",
  inputMode,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  ajuda?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium text-muted-foreground">{rotulo}</Label>
      <Input
        type={tipo}
        inputMode={inputMode}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-label={rotulo}
      />
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

/**
 * Configurações da Empresa — dados cadastrais usados no cupom NFC-e e nos
 * relatórios. Dados de `GET /api/configuracoes`, com fallback em
 * `src/lib/configuracoes.ts`; o salvar persiste via `PUT`.
 *
 * CORREÇÃO: os campos eram `defaultValue` (não controlados) e `salvar()`
 * reenviava o objeto ORIGINAL vindo do servidor — clicar em "Salvar"
 * mostrava sucesso mas descartava tudo que a pessoa tinha digitado. Agora
 * os campos são controlados por `formulario`, que é o que de fato é
 * enviado.
 */
export function ConfigEmpresa() {
  const { dados } = useApi<ConfiguracoesApi>("/api/configuracoes", {
    config: { empresa: EMPRESA_DADOS },
  });

  const empresa = dados.config?.empresa ?? dados.empresa;
  const [formulario, setFormulario] = React.useState<EmpresaDados>(empresa ?? EMPRESA_DADOS);
  const [carregouDoServidor, setCarregouDoServidor] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  // Sincroniza o formulário com a resposta do servidor só na PRIMEIRA vez
  // que ela chega — depois disso, o formulário é a fonte de verdade (senão
  // um recarregar() em segundo plano apagaria o que a pessoa está digitando).
  React.useEffect(() => {
    if (!carregouDoServidor && empresa !== EMPRESA_DADOS) {
      setFormulario(empresa ?? EMPRESA_DADOS);
      setCarregouDoServidor(true);
    }
  }, [empresa, carregouDoServidor]);

  function campo<K extends keyof EmpresaDados>(chave: K) {
    return (valor: string) =>
      setFormulario((f) => ({
        ...f,
        [chave]: chave === "despesaFolhaMensal" ? Number(valor.replace(",", ".")) || 0 : valor,
      }));
  }

  const salvar = async () => {
    setSalvando(true);
    try {
      await api("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({ chave: "empresa", valor: formulario }),
      });
      toast.success("Dados da empresa salvos.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar dados da empresa");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-status-waiting-border bg-status-waiting-bg p-4 text-sm text-status-waiting">
        <p>
          <strong>Necessários para a NFC-e (PEDIDO 19):</strong> razão social, CNPJ
          (14 dígitos), inscrição estadual e UF. Sem eles, a emissão é recusada
          antes de enviar ao provedor — a venda continua normal e o documento fica
          registrado com o motivo.
        </p>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
            Dados cadastrais
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Razão social, CNPJ e inscrição estadual — impressos no rodapé do cupom.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <Campo rotulo="Razão social" valor={formulario.razaoSocial} onChange={campo("razaoSocial")} />
          <Campo rotulo="Nome fantasia" valor={formulario.nomeFantasia} onChange={campo("nomeFantasia")} />
          <Campo rotulo="CNPJ" valor={formulario.cnpj} onChange={campo("cnpj")} />
          <Campo rotulo="Inscrição estadual" valor={formulario.inscricaoEstadual} onChange={campo("inscricaoEstadual")} />
          <Campo rotulo="Regime tributário" valor={formulario.regime} onChange={campo("regime")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="text-xl">Endereço e contato</CardTitle>
          <p className="text-sm text-muted-foreground">
            Onde o salão está e como clientes/fornecedores encontram a empresa.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <div className="sm:col-span-2">
            <Campo rotulo="Endereço" valor={formulario.rua} onChange={campo("rua")} />
          </div>
          <Campo rotulo="Cidade" valor={formulario.cidade} onChange={campo("cidade")} />
          <Campo rotulo="UF" valor={formulario.uf} onChange={campo("uf")} />
          <Campo rotulo="CEP" valor={formulario.cep} onChange={campo("cep")} />
          <Campo rotulo="Telefone" valor={formulario.telefone} onChange={campo("telefone")} />
          <div className="sm:col-span-2">
            <Campo rotulo="E-mail" valor={formulario.email} onChange={campo("email")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="text-xl">Financeiro</CardTitle>
          <p className="text-sm text-muted-foreground">
            Usado só para compor o relatório Financeiro — não afeta vendas nem NFC-e.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <Campo
            rotulo="Folha de pagamento (estimativa mensal, R$)"
            tipo="text"
            inputMode="decimal"
            valor={String(formulario.despesaFolhaMensal || "")}
            onChange={campo("despesaFolhaMensal")}
            ajuda="Deixe em branco (0) se não quiser incluir folha no relatório Financeiro."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando}>
          <Save className="h-4 w-4" aria-hidden="true" />
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
