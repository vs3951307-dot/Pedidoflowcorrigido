"use client";

import { useMemo, useState } from "react";
import {
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  Printer,
  ChefHat,
  Save,
  CreditCard,
  Clock3,
  ShoppingBag,
  ChevronRight,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category: string;
  requiresConfiguration?: boolean;
};

type OrderItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  description?: string;
};

type MesaPedidoOverlayProps = {
  open: boolean;

  table: {
    id: string;
    name: string;
    openedAt?: Date | string;
    commandNumber?: string | number;
  };

  products: Product[];
  items: OrderItem[];

  onClose: () => void;

  /*
   * IMPORTANTE:
   * Use esta função para conectar ao fluxo já existente.
   * Pizza pode abrir seletor de tamanho/sabores.
   * Produto simples pode ser adicionado diretamente.
   */
  onProductSelect: (product: Product) => void;

  onIncrease: (itemId: string) => void;
  onDecrease: (itemId: string) => void;
  onRemove: (itemId: string) => void;

  onSave: () => void;
  onSendKitchen: () => void;
  onPrint: () => void;
  onFinalize: () => void;

  discount?: number;
  additional?: number;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function MesaPedidoOverlay({
  open,
  table,
  products,
  items,
  onClose,
  onProductSelect,
  onIncrease,
  onDecrease,
  onRemove,
  onSave,
  onSendKitchen,
  onPrint,
  onFinalize,
  discount = 0,
  additional = 0,
}: MesaPedidoOverlayProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");

  const categories = useMemo(() => {
    return [
      "Todos",
      ...Array.from(
        new Set(products.map((product) => product.category).filter(Boolean))
      ),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        category === "Todos" || product.category === category;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, category, search]);

  const subtotal = useMemo(() => {
    return items.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0
    );
  }, [items]);

  const total = Math.max(0, subtotal - discount + additional);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/55 backdrop-blur-[3px] p-2 md:p-5">
      <div className="mx-auto flex h-full max-w-[1750px] overflow-hidden rounded-[24px] border border-slate-200 bg-[#f7f8fa] shadow-2xl">

        {/* ========================= */}
        {/* CATÁLOGO - LADO ESQUERDO */}
        {/* ========================= */}

        <section className="flex min-w-0 flex-1 flex-col">

          {/* HEADER */}

          <header className="flex min-h-[82px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-7">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-lg font-black text-white shadow-sm">
                  {table.name.replace(/\D/g, "") || "M"}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                    Atendimento
                  </p>

                  <h1 className="text-xl font-bold text-slate-900 md:text-2xl">
                    {table.name}
                  </h1>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {table.commandNumber && (
                <div className="hidden rounded-xl bg-slate-100 px-4 py-2 md:block">
                  <p className="text-[11px] font-medium text-slate-400">
                    COMANDA
                  </p>
                  <p className="font-bold text-slate-700">
                    #{table.commandNumber}
                  </p>
                </div>
              )}

              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={21} />
              </button>
            </div>
          </header>

          {/* BUSCA */}

          <div className="bg-white px-5 pb-4 pt-5 md:px-7">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pizza, lanche, bebida..."
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-[15px] font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
              />
            </div>
          </div>

          {/* CATEGORIAS */}

          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-5 pb-5 md:px-7">
            {categories.map((item) => {
              const active = item === category;

              return (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`
                    whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition
                    ${
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }
                  `}
                >
                  {item}
                </button>
              );
            })}
          </div>

          {/* PRODUTOS */}

          <div className="flex-1 overflow-y-auto p-5 md:p-7">
            {filteredProducts.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                <ShoppingBag size={38} className="mb-3 text-slate-300" />
                <p className="font-semibold text-slate-600">
                  Nenhum produto encontrado
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Tente outra categoria ou pesquisa.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => onProductSelect(product)}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingBag
                            size={32}
                            className="text-slate-300"
                          />
                        </div>
                      )}

                      <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-orange-600 shadow-sm">
                        <Plus size={18} />
                      </div>
                    </div>

                    <div className="p-3.5">
                      <p className="line-clamp-2 min-h-[40px] text-sm font-bold leading-5 text-slate-800">
                        {product.name}
                      </p>

                      <div className="mt-3 flex items-end justify-between">
                        <span className="text-base font-extrabold text-orange-600">
                          {money.format(product.price)}
                        </span>

                        {product.requiresConfiguration && (
                          <ChevronRight
                            size={17}
                            className="text-slate-400"
                          />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ======================== */}
        {/* COMANDA - LADO DIREITO */}
        {/* ======================== */}

        <aside className="hidden w-[390px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex xl:w-[430px]">

          {/* CABEÇALHO COMANDA */}

          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Comanda atual
                </p>

                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {table.name}
                </h2>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
                <Clock3 size={16} />
                <span className="text-sm font-bold">Aberta</span>
              </div>
            </div>
          </div>

          {/* ITENS */}

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                  <ShoppingBag size={30} className="text-slate-400" />
                </div>

                <p className="font-bold text-slate-700">
                  Comanda vazia
                </p>

                <p className="mt-1 max-w-[240px] text-sm leading-5 text-slate-400">
                  Selecione um produto ao lado para adicionar à mesa.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800">
                          {item.name}
                        </p>

                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-500">
                            {item.description}
                          </p>
                        )}

                        <p className="mt-2 text-sm font-extrabold text-orange-600">
                          {money.format(item.unitPrice * item.quantity)}
                        </p>
                      </div>

                      <button
                        onClick={() => onRemove(item.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">
                        {money.format(item.unitPrice)} un.
                      </span>

                      <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
                        <button
                          onClick={() => onDecrease(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                        >
                          <Minus size={16} />
                        </button>

                        <span className="w-9 text-center text-sm font-black text-slate-800">
                          {item.quantity}
                        </span>

                        <button
                          onClick={() => onIncrease(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* VALORES */}

          <div className="border-t border-slate-200 px-5 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-semibold text-slate-700">
                  {money.format(subtotal)}
                </span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Desconto</span>
                  <span className="font-semibold text-emerald-600">
                    - {money.format(discount)}
                  </span>
                </div>
              )}

              {additional > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Acréscimo</span>
                  <span className="font-semibold text-slate-700">
                    + {money.format(additional)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-end justify-between border-t border-dashed border-slate-200 pt-4">
              <span className="font-bold text-slate-700">
                Total
              </span>

              <span className="text-3xl font-black tracking-tight text-slate-950">
                {money.format(total)}
              </span>
            </div>
          </div>

          {/* AÇÕES */}

          <div className="border-t border-slate-200 bg-slate-50 p-4">

            <button
              onClick={onSendKitchen}
              disabled={!items.length}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChefHat size={19} />
              Enviar para cozinha
            </button>

            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <button
                onClick={onSave}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                <Save size={17} />
                Salvar
              </button>

              <button
                onClick={onPrint}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                <Printer size={17} />
                Imprimir
              </button>

              <button
                onClick={onFinalize}
                disabled={!items.length}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
              >
                <CreditCard size={17} />
                Finalizar
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
