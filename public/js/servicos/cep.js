// =============================================================================
// CEP, ENDEREÇO E LOCALIZAÇÃO — consultas gratuitas pela internet
// =============================================================================
//   * ViaCEP (viacep.com.br): CEP -> endereço, e rua -> lista de CEPs. Grátis, sem chave.
//   * Nominatim (OpenStreetMap): coordenadas (GPS) -> endereço. Grátis, sem chave;
//     uso moderado e só quando o usuário toca no botão (política deles: 1 pedido/seg).
//   * GPS do aparelho: navigator.geolocation (o Android pede permissão).
// O CEP NUNCA é obrigatório: se a pessoa não souber, há 3 outros caminhos.
// =============================================================================

import { ErroApp } from '../nucleo/erros.js';
import { URL_VIACEP, URL_NOMINATIM } from '../nucleo/constantes.js';
import { cepValido, somenteDigitosCEP, enderecoDoViaCep, enderecoDoNominatim } from '../dominio/endereco.js';

async function buscarJson(url, { tempoMs = 10000 } = {}) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoMs);
  try {
    const resposta = await fetch(url, { signal: controle.signal, headers: { Accept: 'application/json' } });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await resposta.json();
  } catch (erro) {
    throw new ErroApp(
      'Não foi possível fazer a busca agora (sem internet ou o serviço está fora do ar). Você pode preencher o endereço à mão.',
      'sem-rede',
      erro,
    );
  } finally {
    clearTimeout(relogio);
  }
}

/** CEP -> endereço. Retorna null se o CEP não existir. */
export async function buscarPorCEP(cep) {
  if (!cepValido(cep)) throw new ErroApp('O CEP precisa ter 8 números.', 'cep-invalido');
  const dados = await buscarJson(`${URL_VIACEP}/${somenteDigitosCEP(cep)}/json/`);
  if (!dados || dados.erro) return null;
  return enderecoDoViaCep(dados);
}

/** "Não sei o CEP": procura pelo nome da rua. Retorna até 15 resultados. */
export async function buscarPorRua({ uf, cidade, rua }) {
  const r = String(rua ?? '').trim();
  const c = String(cidade ?? '').trim();
  const u = String(uf ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) throw new ErroApp('Escolha o estado.', 'busca-invalida');
  if (c.length < 3) throw new ErroApp('Digite o nome da cidade (pelo menos 3 letras).', 'busca-invalida');
  if (r.length < 3) throw new ErroApp('Digite o nome da rua (pelo menos 3 letras).', 'busca-invalida');
  const dados = await buscarJson(`${URL_VIACEP}/${u}/${encodeURIComponent(c)}/${encodeURIComponent(r)}/json/`);
  if (!Array.isArray(dados)) return [];
  return dados.slice(0, 15).map(enderecoDoViaCep);
}

/** Pede ao aparelho a posição atual (GPS). */
export function obterLocalizacao({ tempoMs = 15000 } = {}) {
  return new Promise((resolver, rejeitar) => {
    if (!('geolocation' in navigator)) {
      rejeitar(new ErroApp('Este aparelho não consegue informar a localização. Preencha o endereço à mão.', 'sem-gps'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolver({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (erro) => {
        const mensagem = erro.code === 1
          ? 'Você não permitiu o uso da localização. Libere nas permissões do navegador ou preencha o endereço à mão.'
          : 'Não conseguimos pegar a sua localização agora. Tente em um lugar aberto ou preencha o endereço à mão.';
        rejeitar(new ErroApp(mensagem, 'sem-gps'));
      },
      { enableHighAccuracy: true, timeout: tempoMs, maximumAge: 60000 },
    );
  });
}

/** Coordenadas -> endereço (inclui lat/lng no resultado). */
export async function buscarPorCoordenadas({ lat, lng }) {
  const dados = await buscarJson(
    `${URL_NOMINATIM}/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
  );
  const endereco = enderecoDoNominatim(dados);
  return { ...endereco, lat, lng };
}
