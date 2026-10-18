/* =============================================================================
   MERAKI — Frases do convite
   O sistema sorteia a frase por tipo de festa. Frases curtas e genéricas:
   - reduzem erros de escrita da IA (acentos, "nh", "ç")
   - evitam slogans de marcas/personagens (risco de recusa do filtro)
   Para trocar/adicionar frases, edite as listas abaixo. Mantenha-as curtas
   (até ~40 caracteres) e sem nomes de personagens.
   ============================================================================= */

const PHRASES = {
    infantil: [
        'Venha comemorar esse dia especial comigo!',
        'Vai ser muito divertido!',
        'Sua presença vai fazer a festa!',
        'Venha brincar e comemorar comigo!',
        'Vamos comemorar juntos!',
    ],
    debutante: [
        'Venha celebrar esse sonho comigo',
        'Uma noite para lembrar para sempre',
        'Sua presença torna esse dia especial',
        'Vamos celebrar essa nova fase juntos',
    ],
    adulto: [
        'Celebre esse momento comigo',
        'Sua presença é o meu melhor presente',
        'Venha brindar a vida comigo',
        'Vamos comemorar juntos esse dia',
    ],
};

/** Sorteia uma frase para o tipo de festa (infantil, debutante ou adulto). */
function pickPhrase(type) {
    const list = PHRASES[type] || PHRASES.infantil;
    return list[Math.floor(Math.random() * list.length)];
}

module.exports = { PHRASES, pickPhrase };
