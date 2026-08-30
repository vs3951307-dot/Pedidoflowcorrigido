"use client";

import {
  Armchair,
  Bike,
  Bot,
  Building2,
  DatabaseBackup,
  FileDigit,
  MessageCircle,
  MessageSquareWarning,
  Palette,
  Percent,
  Pizza,
  Printer,
  ScrollText,
  Send,
  Tag,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ConfigEmpresa } from "./_components/config-empresa";
import { ConfigNfce } from "./_components/config-nfce";
import { ConfigImpressoras } from "./_components/config-impressoras";
import { ConfigProdutos } from "./_components/config-produtos";
import { ConfigCategorias } from "./_components/config-categorias";
import { ConfigMesas } from "./_components/config-mesas";
import { ConfigTaxas } from "./_components/config-taxas";
import { ConfigBackup } from "./_components/config-backup";
import { ConfigUsuarios } from "./_components/config-usuarios";
import { ConfigAuditoria } from "./_components/config-auditoria";
import { ConfigFilaImpressao } from "./_components/config-fila-impressao";
import { ConfigWhatsApp } from "./_components/config-whatsapp";
import { ConfigAtendenteIa } from "./_components/config-atendente-ia";
import { ConfigCopilotoPersona } from "./_components/config-copiloto-persona";
import { ConfigEntregadorContingencia } from "./_components/config-entregador-contingencia";
import { ConfigEntregadores } from "./_components/config-entregadores";
import { ConfigPizzaPreco } from "./_components/config-pizza-preco";
import { ConfigIdentidade } from "./_components/config-identidade";

const ABAS = [
  { valor: "empresa", rotulo: "Empresa", icone: Building2 },
  { valor: "identidade", rotulo: "Identidade", icone: Palette },
  { valor: "nfce", rotulo: "NFC-e", icone: FileDigit },
  { valor: "impressoras", rotulo: "Impressoras", icone: Printer },
  { valor: "impressao", rotulo: "Impressão", icone: Send },
  { valor: "produtos", rotulo: "Produtos", icone: Pizza },
  { valor: "categorias", rotulo: "Categorias", icone: Tag },
  { valor: "mesas", rotulo: "Mesas", icone: Armchair },
  { valor: "taxas", rotulo: "Taxas", icone: Percent },
  { valor: "whatsapp", rotulo: "WhatsApp", icone: MessageCircle },
  { valor: "atendente_ia", rotulo: "Atendente IA", icone: Bot },
  { valor: "copiloto_ia", rotulo: "Copiloto IA", icone: Bot },
  { valor: "contingencia", rotulo: "Contingência Entregador", icone: MessageSquareWarning },
  { valor: "entregadores", rotulo: "Entregadores", icone: Bike },
  { valor: "pizza-preco", rotulo: "Regra Pizza", icone: Pizza },
  { valor: "backup", rotulo: "Backup", icone: DatabaseBackup },
  { valor: "usuarios", rotulo: "Usuários", icone: Users },
  { valor: "auditoria", rotulo: "Auditoria", icone: ScrollText },
];

/**
 * Configurações — empresa, emissão NFC-e, impressoras, produtos, taxas,
 * backup, usuários/permissões e auditoria. Cada aba busca e persiste na
 * API (`GET/PUT /api/configuracoes` e endpoints específicos).
 */
export default function ConfiguracoesPage() {
  return (
    <div className="flex flex-col">
      <ErrorBoundary>
      <PageHeader
        title="Configurações"
        description="Empresa, emissão fiscal, impressoras, cardápio, taxas, backup, acesso e auditoria."
      />

      <Tabs defaultValue="empresa">
        <TabsList className="h-auto w-full flex-wrap gap-1 rounded-xl p-1.5 sm:w-fit">
          {ABAS.map((aba) => {
            const Icon = aba.icone;
            return (
              <TabsTrigger key={aba.valor} value={aba.valor} className="gap-2 px-4 py-2">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {aba.rotulo}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="empresa" className="mt-6">
          <ConfigEmpresa />
        </TabsContent>
        <TabsContent value="identidade" className="mt-6">
          <ConfigIdentidade />
        </TabsContent>
        <TabsContent value="nfce" className="mt-6">
          <ConfigNfce />
        </TabsContent>
        <TabsContent value="impressoras" className="mt-6">
          <ConfigImpressoras />
        </TabsContent>
        <TabsContent value="impressao" className="mt-6">
          <ConfigFilaImpressao />
        </TabsContent>
        <TabsContent value="produtos" className="mt-6">
          <ConfigProdutos />
        </TabsContent>
        <TabsContent value="categorias" className="mt-6">
          <ConfigCategorias />
        </TabsContent>
        <TabsContent value="mesas" className="mt-6">
          <ConfigMesas />
        </TabsContent>
        <TabsContent value="taxas" className="mt-6">
          <ConfigTaxas />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-6">
          <ConfigWhatsApp />
        </TabsContent>
        <TabsContent value="atendente_ia" className="mt-6">
          <ConfigAtendenteIa />
        </TabsContent>
        <TabsContent value="copiloto_ia" className="mt-6">
          <ConfigCopilotoPersona />
        </TabsContent>
        <TabsContent value="contingencia" className="mt-6">
          <ConfigEntregadorContingencia />
        </TabsContent>
        <TabsContent value="entregadores" className="mt-6">
          <ConfigEntregadores />
        </TabsContent>
        <TabsContent value="pizza-preco" className="mt-6">
          <ConfigPizzaPreco />
        </TabsContent>
        <TabsContent value="backup" className="mt-6">
          <ConfigBackup />
        </TabsContent>
        <TabsContent value="usuarios" className="mt-6">
          <ConfigUsuarios />
        </TabsContent>
        <TabsContent value="auditoria" className="mt-6">
          <ConfigAuditoria />
        </TabsContent>
      </Tabs>
      </ErrorBoundary>
    </div>
  );
}
