import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

interface DadosEmail {
  para: string;
  nome: string;
  link: string;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sem SMTP configurado (.env), o conteúdo aparece no terminal do backend: serve para
// desenvolver e demonstrar sem depender de provedor de e-mail.
function criarTransporte() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const porta = Number(process.env.SMTP_PORT) || 587;

  return nodemailer.createTransport({
    host,
    port: porta,
    secure: porta === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const remetente = () => process.env.SMTP_FROM || process.env.SMTP_USER;

// Logo embutida no próprio e-mail (anexo inline): aparece mesmo sem o site estar publicado.
// Se o arquivo não existir, o e-mail sai normalmente, só sem a imagem.
const ARQUIVO_LOGO = path.join(__dirname, "..", "assets", "logo-email.png");

function anexosLogo() {
  if (!fs.existsSync(ARQUIVO_LOGO)) return [];
  return [
    {
      filename: "corefix-logo.png",
      path: ARQUIVO_LOGO,
      cid: "corefixlogo",
      contentDisposition: "inline" as const,
    },
  ];
}

const LOGO_HTML = () =>
  fs.existsSync(ARQUIVO_LOGO)
    ? `<p style="margin:0 0 20px"><img src="cid:corefixlogo" alt="CORE FIX Intelligence" width="220" style="display:block;border:0;height:auto"></p>`
    : "";

function botao(link: string, texto: string) {
  return (
    `<p><a href="${escapar(link)}" style="display:inline-block;padding:12px 20px;` +
    `background:#1676ed;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">` +
    `${texto}</a></p>`
  );
}

const RECURSOS_TEXTO =
  "Com o CORE FIX você pode:\n" +
  "- cadastrar os sensores da sua casa e acompanhar tudo em um só painel;\n" +
  "- enviar eventos para a nossa inteligência analisar e apontar comportamentos suspeitos;\n" +
  "- ver o histórico de alertas e manter seu perfil sempre atualizado.";

const RECURSOS_HTML =
  `<p>Com o CORE FIX você pode:</p>` +
  `<ul style="padding-left:20px;line-height:1.6">` +
  `<li>cadastrar os sensores da sua casa e acompanhar tudo em um só painel;</li>` +
  `<li>enviar eventos para a nossa inteligência analisar e apontar comportamentos suspeitos;</li>` +
  `<li>ver o histórico de alertas e manter seu perfil sempre atualizado.</li>` +
  `</ul>`;

// E-mail só com o link para confirmar o endereço (enviado no cadastro, logo depois do de
// boas-vindas, e também quando a pessoa pede um novo link). Confirmar por aqui é o que
// prova que o e-mail é real e pertence à pessoa.
export async function enviarEmailVerificacao({ para, nome, link }: DadosEmail) {
  const transporte = criarTransporte();

  if (!transporte) {
    console.log("\n[E-mail não configurado] Link de verificação para", para);
    console.log(link, "\n");
    return { enviado: false };
  }

  const nomeSeguro = escapar(nome);

  await transporte.sendMail({
    from: remetente(),
    to: para,
    attachments: anexosLogo(),
    subject: "Confirme seu e-mail - CORE FIX Intelligence",
    text:
      `Olá, ${nome}!\n\n` +
      `Para ativar sua conta, confirme seu e-mail pelo link abaixo (vale por 24 horas):\n${link}\n\n` +
      `Se você não criou uma conta no CORE FIX, ignore esta mensagem.`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#14202f">` +
      LOGO_HTML() +
      `<h2 style="color:#1676ed;margin:0 0 12px">Confirme seu e-mail</h2>` +
      `<p>Olá, <strong>${nomeSeguro}</strong>!</p>` +
      `<p>Para ativar sua conta, confirme seu e-mail. O link vale por 24 horas.</p>` +
      botao(link, "Confirmar e-mail") +
      `<p style="font-size:13px;color:#5b6b80">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(link)}</p>` +
      `<p style="font-size:13px;color:#5b6b80">Se você não criou uma conta, ignore esta mensagem.</p>` +
      `</div>`,
  });

  return { enviado: true };
}

// E-mail de boas-vindas: enviado depois que a pessoa confirma o e-mail (cadastro normal)
// ou no primeiro acesso por Google/GitHub. Nos dois casos a conta já está pronta.
export async function enviarEmailBoasVindas({ para, nome }: { para: string; nome: string }) {
  const transporte = criarTransporte();
  const site = process.env.FRONTEND_URL || "http://localhost:5173";

  if (!transporte) {
    console.log("\n[E-mail não configurado] E-mail de boas-vindas para", para, "\n");
    return { enviado: false };
  }

  const nomeSeguro = escapar(nome);

  await transporte.sendMail({
    from: remetente(),
    to: para,
    attachments: anexosLogo(),
    subject: "Bem-vindo ao CORE FIX Intelligence!",
    text:
      `Olá, ${nome}! Seja bem-vindo(a) ao CORE FIX Intelligence.\n\n` +
      `Sua conta já está pronta. Acesse: ${site}\n\n${RECURSOS_TEXTO}`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#14202f">` +
      LOGO_HTML() +
      `<h2 style="color:#1676ed;margin:0 0 12px">Bem-vindo ao CORE FIX Intelligence!</h2>` +
      `<p>Olá, <strong>${nomeSeguro}</strong>! Que bom ter você com a gente.</p>` +
      `<p>Sua conta já está pronta para uso.</p>` +
      botao(site, "Acessar minha conta") +
      RECURSOS_HTML +
      `</div>`,
  });

  return { enviado: true };
}
