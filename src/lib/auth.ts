import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const SESSÃO_DIAS = 7;

export async function verificarSenha(senha: string, hash: string) {
  return bcrypt.compare(senha, hash);
}

export function criarToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function criarSessao(usuarioId: string, userAgent?: string) {
  const token = criarToken();
  const hash = hashToken(token);
  await prisma.sessao.create({
    data: {
      token: hash,
      usuarioId,
      userAgent: userAgent ?? null,
      expiraEm: new Date(Date.now() + SESSÃO_DIAS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function encerrarSessao(token: string) {
  await prisma.sessao.deleteMany({ where: { token: hashToken(token) } });
}

export async function encerrarSessoesDoUsuario(usuarioId: string) {
  await prisma.sessao.deleteMany({ where: { usuarioId } });
}

export async function usuarioDaSessao(token: string | undefined) {
  if (!token) return null;
  const sessao = await prisma.sessao.findUnique({
    where: { token: hashToken(token) },
    include: { usuario: { include: { permissaos: true, empresa: true } } },
  });
  if (!sessao) return null;
  if (sessao.expiraEm < new Date()) {
    await prisma.sessao.delete({ where: { token: sessao.token } });
    return null;
  }
  return sessao.usuario;
}

/** Status de Empresa que permitem login/uso normal do sistema. */
export const STATUS_EMPRESA_ATIVOS = new Set(["ativa", "teste"]);

export async function getUsuarioAtual() {
  const store = cookies();
  const token = store.get("sessao")?.value;
  const usuario = await usuarioDaSessao(token);
  if (!usuario) return null;
  if (usuario.ativo === false) return null;
  if (!STATUS_EMPRESA_ATIVOS.has(usuario.empresa.status)) return null;
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcesso: new Date() },
  });
  await prisma.empresa
    .update({ where: { id: usuario.empresaId }, data: { ultimaAtividadeEm: new Date() } })
    .catch(() => null);
  return usuario;
}

export async function getUsuarioAtualOuNull() {
  return getUsuarioAtual().catch(() => null);
}

/** Valida uma sessão sem gravar "último acesso" (para APIs de leitura leve). */
export async function sessaoValida() {
  const token = cookies().get("sessao")?.value;
  const usuario = await usuarioDaSessao(token);
  if (!usuario || usuario.ativo === false) return null;
  if (!STATUS_EMPRESA_ATIVOS.has(usuario.empresa.status)) return null;
  return usuario;
}

export function compararHashes(a: string, b: string) {
  const ha = Buffer.from(a, "hex");
  const hb = Buffer.from(b, "hex");
  return ha.length === hb.length && timingSafeEqual(ha, hb);
}
