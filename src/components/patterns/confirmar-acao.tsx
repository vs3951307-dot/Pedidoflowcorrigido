"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface ConfirmarAcaoProps {
  trigger: ReactNode;
  titulo: string;
  descricao: string;
  textoConfirmar?: string;
  variante?: "destructive" | "primary";
  aoConfirmar: () => void | Promise<void>;
}

/** Uso: envolva o botão de ação perigosa (cancelar, excluir, fechar caixa)
 *  com este componente em vez de chamar a ação direto no onClick. */
export function ConfirmarAcao({
  trigger,
  titulo,
  descricao,
  textoConfirmar = "Confirmar",
  variante = "destructive",
  aoConfirmar,
}: ConfirmarAcaoProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={variante}
              onClick={() => aoConfirmar()}
            >
              {textoConfirmar}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
