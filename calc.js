// calc.js — motor de cálculo (Carnê-Leão vs Simples Nacional + Fator R).
// Usado tanto pelo index.html (via <script src="calc.js">) quanto pelo test_calc.js (via require),
// para garantir que o teste valida exatamente o código que roda no navegador (zero duplicação/drift).
//
// Fontes das regras (conferidas em 2026-08-03):
// - Tabela progressiva mensal do IRPF 2026 (Lei 15.270/2025): mesmas faixas/deduções nominais
//   vigentes desde 2025, + redutor que isenta rendimento tributável mensal até R$ 5.000,00 e
//   aplica redução linear decrescente entre R$ 5.000,01 e R$ 7.350,00.
// - Tabelas do Simples Nacional Anexo III e Anexo V (LC 123/2006 e alterações, valores nominais
//   estáveis desde 2018 — não têm correção anual automática por lei).
// - Fator R: Folha de pagamento (12 meses) / Receita Bruta (12 meses). >= 28% → Anexo III
//   (menor carga). < 28% → Anexo V. Aqui simplificado como "% do faturamento pago como pró-labore",
//   proxy comum usado por calculadoras do gênero — não substitui o cálculo oficial da folha completa.

(function (root) {
  'use strict';

  // ---------- Carnê-Leão (IRPF 2026) ----------

  // Tabela progressiva mensal nominal (vigente desde 2025, mantida em 2026).
  var FAIXAS_IRPF = [
    { ate: 2428.80, aliq: 0,     deduz: 0 },
    { ate: 2826.65, aliq: 0.075, deduz: 182.16 },
    { ate: 3751.05, aliq: 0.15,  deduz: 394.16 },
    { ate: 4664.68, aliq: 0.225, deduz: 675.49 },
    { ate: Infinity, aliq: 0.275, deduz: 908.73 }
  ];

  function impostoTabelaNominal(rendimento) {
    for (var i = 0; i < FAIXAS_IRPF.length; i++) {
      if (rendimento <= FAIXAS_IRPF[i].ate) {
        var f = FAIXAS_IRPF[i];
        var v = rendimento * f.aliq - f.deduz;
        return Math.max(0, v);
      }
    }
    return 0;
  }

  // Redutor da Lei 15.270/2025: isenção plena até R$5.000, redução linear decrescente até R$7.350.
  var TETO_ISENCAO = 5000;
  var TETO_REDUTOR = 7350;

  function irpfMensal(rendimento) {
    rendimento = Math.max(0, rendimento || 0);
    if (rendimento <= TETO_ISENCAO) return 0;
    var imp = impostoTabelaNominal(rendimento);
    if (rendimento <= TETO_REDUTOR) {
      var redutor = Math.max(0, 978.62 - 0.133145 * rendimento);
      imp = Math.max(0, imp - redutor);
    }
    return imp;
  }

  function carneLeaoAnual(rendimentoMensal) {
    return irpfMensal(rendimentoMensal) * 12;
  }

  // ---------- Simples Nacional — Anexo III e Anexo V ----------

  var ANEXO_III = [
    { ate: 180000,   aliq: 0.06,  deduz: 0 },
    { ate: 360000,   aliq: 0.112, deduz: 9360 },
    { ate: 720000,   aliq: 0.135, deduz: 17640 },
    { ate: 1800000,  aliq: 0.16,  deduz: 35640 },
    { ate: 3600000,  aliq: 0.21,  deduz: 125640 },
    { ate: 4800000,  aliq: 0.33,  deduz: 648000 }
  ];

  var ANEXO_V = [
    { ate: 180000,   aliq: 0.155, deduz: 0 },
    { ate: 360000,   aliq: 0.18,  deduz: 4500 },
    { ate: 720000,   aliq: 0.195, deduz: 9900 },
    { ate: 1800000,  aliq: 0.205, deduz: 17100 },
    { ate: 3600000,  aliq: 0.23,  deduz: 62100 },
    { ate: 4800000,  aliq: 0.305, deduz: 540000 }
  ];

  function faixaSimples(tabela, rbt12) {
    for (var i = 0; i < tabela.length; i++) {
      if (rbt12 <= tabela[i].ate) return tabela[i];
    }
    return tabela[tabela.length - 1]; // acima de 4.8M: fora do Simples na prática; usa último degrau como teto conservador
  }

  function aliquotaEfetiva(rbt12, faixa) {
    if (rbt12 <= 0) return faixa.aliq;
    var v = (rbt12 * faixa.aliq - faixa.deduz) / rbt12;
    return Math.max(0, v);
  }

  var FATOR_R_CORTE = 0.28; // >= 28% => Anexo III

  function anexoPorFatorR(fatorRPercentual) {
    return (fatorRPercentual / 100) >= FATOR_R_CORTE ? 'III' : 'V';
  }

  function simplesAnual(faturamentoAnual, fatorRPercentual) {
    var anexo = anexoPorFatorR(fatorRPercentual);
    var tabela = anexo === 'III' ? ANEXO_III : ANEXO_V;
    var faixa = faixaSimples(tabela, faturamentoAnual);
    var aliqEf = aliquotaEfetiva(faturamentoAnual, faixa);
    var impostoAnual = faturamentoAnual * aliqEf;
    return { anexo: anexo, aliquotaNominal: faixa.aliq, aliquotaEfetiva: aliqEf, impostoAnual: impostoAnual };
  }

  // ---------- Comparação PF (Carnê-Leão) vs CNPJ (Simples + Fator R) ----------

  function comparar(faturamentoMensalPF, fatorRPercentual, custoContabilidadeMensal) {
    faturamentoMensalPF = Math.max(0, faturamentoMensalPF || 0);
    custoContabilidadeMensal = Math.max(0, custoContabilidadeMensal || 0);
    var faturamentoAnual = faturamentoMensalPF * 12;

    var carneLeao = carneLeaoAnual(faturamentoMensalPF);
    var simples = simplesAnual(faturamentoAnual, fatorRPercentual);
    var custoContabilidadeAnual = custoContabilidadeMensal * 12;
    var custoTotalPJ = simples.impostoAnual + custoContabilidadeAnual;
    var economiaAnual = carneLeao - custoTotalPJ;

    var semaforo;
    if (economiaAnual > 1200) semaforo = 'verde';
    else if (economiaAnual > 0) semaforo = 'amarelo';
    else semaforo = 'vermelho';

    return {
      faturamentoAnual: faturamentoAnual,
      carneLeaoAnual: carneLeao,
      simplesAnexo: simples.anexo,
      simplesAliquotaEfetiva: simples.aliquotaEfetiva,
      simplesImpostoAnual: simples.impostoAnual,
      custoContabilidadeAnual: custoContabilidadeAnual,
      custoTotalPJ: custoTotalPJ,
      economiaAnual: economiaAnual,
      semaforo: semaforo
    };
  }

  var API = {
    irpfMensal: irpfMensal,
    carneLeaoAnual: carneLeaoAnual,
    aliquotaEfetiva: aliquotaEfetiva,
    faixaSimples: faixaSimples,
    simplesAnual: simplesAnual,
    anexoPorFatorR: anexoPorFatorR,
    comparar: comparar,
    FATOR_R_CORTE: FATOR_R_CORTE,
    ANEXO_III: ANEXO_III,
    ANEXO_V: ANEXO_V
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    root.RSFR = API; // Receita Saúde + Fator R
  }
})(typeof window !== 'undefined' ? window : this);
