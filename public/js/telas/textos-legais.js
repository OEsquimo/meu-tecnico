// =============================================================================
// TEXTOS LEGAIS — Termos de Uso e Política de Privacidade (MODELO)
// =============================================================================
// ATENÇÃO: este texto é um MODELO escrito para o projeto, NÃO é parecer jurídico.
// Antes de vender o aplicativo, peça a um advogado para revisar e preencha os
// dados da empresa (razão social, CNPJ, e-mail de contato, foro).
// Pontos marcados com [COMPLETAR] precisam ser preenchidos por você.
// =============================================================================

export const DATA_ATUALIZACAO_TEXTOS = 'Outubro de 2026';

export const TERMOS_DE_USO = [
  {
    titulo: '1. O que é o Meu Técnico',
    paragrafos: [
      'O Meu Técnico é um aplicativo para técnicos e empresas de refrigeração e ar-condicionado organizarem clientes, aparelhos, serviços, agenda, lembretes de retorno e controle financeiro.',
      'Ao criar uma conta ou aceitar um convite, você declara que leu e concorda com estes termos e com a Política de Privacidade.',
    ],
  },
  {
    titulo: '2. Conta, equipe e responsabilidades',
    itens: [
      'Cada empresa tem um administrador, que cria a conta, convida funcionários (técnicos) e controla o que cada um acessa.',
      'O técnico só enxerga os serviços atribuídos a ele e não vê valores em dinheiro.',
      'Você é responsável por manter a senha em segredo e por tudo que for feito com a sua conta. Avise-nos se suspeitar de uso indevido.',
      'O administrador responde pelos funcionários que convidar e deve bloquear ou remover quem sair da empresa.',
    ],
  },
  {
    titulo: '3. Dados dos seus clientes',
    paragrafos: [
      'Os nomes, telefones e endereços dos seus clientes são dados pessoais. Quem decide cadastrá-los e para que usá-los é a sua empresa (controladora); o Meu Técnico apenas os guarda e processa em seu nome (operador).',
      'Cadastre somente dados necessários para prestar o serviço e enviar lembretes de manutenção. Os lembretes são enviados por você, manualmente, pelo WhatsApp. O aplicativo não envia mensagens automáticas.',
    ],
  },
  {
    titulo: '4. Planos, limites e pagamento',
    itens: [
      'Existe um plano grátis, com limite de clientes cadastrados, e planos pagos com limites maiores. Valores e limites aparecem na tela "Meu plano" e podem ser alterados; mudanças não atingem períodos já pagos.',
      'Se o plano vencer ou o limite for atingido, você deixa de poder cadastrar novos clientes, mas seus dados continuam guardados e podem ser consultados e baixados em backup.',
      'Nenhum dado é apagado por causa de mudança de plano.',
      'Condições de cobrança, renovação e reembolso: [COMPLETAR conforme a forma de cobrança escolhida].',
    ],
  },
  {
    titulo: '5. Uso adequado',
    itens: [
      'Não use o app para fins ilegais, para enviar spam ou para tentar acessar dados de outras empresas.',
      'Não tente burlar limites de plano, regras de segurança ou o sistema de login.',
      'Podemos suspender contas que violem estes termos, avisando sempre que possível.',
    ],
  },
  {
    titulo: '6. Seus dados, backup e exclusão',
    paragrafos: [
      'Você pode baixar um backup em JSON de todos os seus dados a qualquer momento (tela Backup) e pode excluir a conta e todos os dados (tela Minha conta). A exclusão é definitiva.',
      'Recomendamos fazer backups periódicos e guardá-los em local seguro.',
    ],
  },
  {
    titulo: '7. Disponibilidade e limitação de responsabilidade',
    paragrafos: [
      'Trabalhamos para manter o app disponível, mas não garantimos funcionamento ininterrupto. O app depende de serviços de terceiros (Google Firebase, internet do seu aparelho).',
      'Os valores, datas e lembretes mostrados são apoio à sua gestão; conferir contratos, garantias e obrigações legais continua sendo responsabilidade da sua empresa.',
      'Na extensão permitida pela lei, não respondemos por lucros cessantes ou danos indiretos. Isto não afasta direitos que a lei garante ao consumidor.',
    ],
  },
  {
    titulo: '8. Alterações e contato',
    paragrafos: [
      'Podemos atualizar estes termos. Mudanças relevantes serão avisadas no app. Continuar usando depois do aviso significa concordar com a nova versão.',
      'Contato: [COMPLETAR: e-mail de suporte]. Responsável: [COMPLETAR: razão social e CNPJ ou nome do responsável]. Foro: [COMPLETAR: comarca], aplicando-se a lei brasileira.',
    ],
  },
];

export const POLITICA_DE_PRIVACIDADE = [
  {
    titulo: '1. Quem somos',
    paragrafos: [
      'O Meu Técnico é operado por [COMPLETAR: razão social/nome e CNPJ/CPF]. Esta política explica como tratamos dados pessoais, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
    ],
  },
  {
    titulo: '2. Quais dados tratamos',
    itens: [
      'Dados da conta: nome, e-mail, senha (guardada de forma protegida pelo Firebase Authentication) e nome da empresa.',
      'Dados da equipe: nome e telefone dos funcionários convidados.',
      'Dados dos clientes da sua empresa: nome, WhatsApp, endereços (e, se você permitir, coordenadas de localização), observações, aparelhos e histórico de serviços.',
      'Dados financeiros do serviço: valores e situação de pagamento, visíveis apenas ao administrador.',
      'Dados técnicos básicos de funcionamento (por exemplo, falhas), sem anúncios e sem venda de dados.',
    ],
  },
  {
    titulo: '3. Para que usamos',
    itens: [
      'Permitir o funcionamento do aplicativo: cadastros, agenda, lembretes de retorno e relatórios.',
      'Controlar limites do plano, cobrança e suporte.',
      'Segurança: impedir que uma empresa veja os dados de outra e prevenir fraudes.',
      'Não usamos os dados dos clientes da sua empresa para publicidade e não os vendemos.',
    ],
  },
  {
    titulo: '4. Com quem compartilhamos',
    itens: [
      'Google Firebase (Autenticação, Banco de Dados e Hospedagem): guarda os dados como nosso operador.',
      'ViaCEP: ao buscar um endereço por CEP ou por rua, o CEP/nome da rua digitado é enviado a este serviço público.',
      'OpenStreetMap (Nominatim): se você usar "Usar minha localização", as coordenadas são enviadas para descobrir o endereço.',
      'WhatsApp: ao tocar em enviar lembrete, o app abre o WhatsApp com a mensagem pronta; quem envia é você.',
      'O dono do aplicativo vê dados da conta (nome da empresa, plano, quantidade de clientes), mas não vê nome, telefone ou endereço dos clientes de cada empresa.',
    ],
  },
  {
    titulo: '5. Por quanto tempo guardamos',
    paragrafos: [
      'Enquanto a conta existir. Ao excluir a conta, apagamos os dados dos clientes, aparelhos, serviços e equipe. Podemos manter registros mínimos de cobrança pelo prazo exigido por lei.',
    ],
  },
  {
    titulo: '6. Seus direitos',
    itens: [
      'Acesso e correção: você vê e edita seus dados no próprio app.',
      'Portabilidade: baixe tudo em JSON na tela Backup.',
      'Eliminação: exclua a conta e os dados na tela Minha conta.',
      'Informação, revogação e demais direitos da LGPD: fale com [COMPLETAR: e-mail do encarregado/contato].',
      'Se você é cliente final de uma empresa que usa o app, fale primeiro com a empresa: ela decide sobre os seus dados.',
    ],
  },
  {
    titulo: '7. Segurança',
    paragrafos: [
      'Usamos conexão criptografada (HTTPS), login com senha e regras de acesso no servidor que separam os dados de cada empresa e escondem valores dos técnicos. Nenhum sistema é 100% imune; em caso de incidente relevante, avisaremos conforme a lei.',
    ],
  },
  {
    titulo: '8. Crianças e adolescentes',
    paragrafos: ['O app é destinado a profissionais e empresas. Não é voltado a menores de 18 anos.'],
  },
  {
    titulo: '9. Mudanças nesta política',
    paragrafos: ['Podemos atualizar esta política e avisaremos no app quando houver mudança relevante.'],
  },
];
