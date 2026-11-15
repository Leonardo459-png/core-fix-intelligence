import { pool } from "../database";
import {
  Entidades,
  ResultadoML
} from "./inteligencia.service";

// Salva o evento e suas recomendações no PostgreSQL
export async function salvarEvento(
  dados: Entidades,
  resultado: ResultadoML
): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const descricao =
      `Análise automática: ${resultado.classificacao}. ` +
      `Horário: ${dados.hora}h.`;

    const evento = await client.query(
      `INSERT INTO eventos
        (tipo, descricao, gravidade, suspeito, confianca, dados)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        "analise_machine_learning",
        descricao,
        resultado.suspeito ? "alta" : "normal",
        resultado.suspeito,
        resultado.confianca,
        JSON.stringify(dados)
      ]
    );

    const eventoId = Number(evento.rows[0].id);

    const recomendacoes = resultado.recomendacoes ??
      (resultado.suspeito
        ? [{
            titulo: "Comportamento suspeito identificado",
            mensagem: resultado.recomendacao,
            categoria: "seguranca",
            prioridade: "alta"
          }]
        : []);

    for (const recomendacao of recomendacoes) {
      await client.query(
        `INSERT INTO recomendacoes
          (evento_id, titulo, mensagem, categoria)
         VALUES ($1, $2, $3, $4)`,
        [
          eventoId,
          recomendacao.titulo,
          recomendacao.mensagem,
          recomendacao.categoria
        ]
      );
    }

    await client.query("COMMIT");

    return eventoId;

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (erroRollback) {
      console.error("Erro ao desfazer transação:", erroRollback);
    }

    throw error;
  } finally {
    client.release();
  }
}
