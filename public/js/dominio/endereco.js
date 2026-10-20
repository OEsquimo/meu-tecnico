// =============================================================================
// ENDEREÇO — formatação, CEP e links de navegação (Waze / Google Maps / outros)
// =============================================================================
// Funções puras. A busca de CEP e de coordenadas (que usa a internet) fica em
// js/servicos/cep.js.
// =============================================================================

import { gerarId } from '../nucleo/banco-comum.js';

/** Só os números do CEP. */
export function somenteDigitosCEP(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

export function cepValido(texto) {
  return somenteDigitosCEP(texto).length === 8;
}

/** "01310100" -> "01310-100" */
export function formatarCEP(texto) {
  const d = somenteDigitosCEP(texto).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Cria um endereço com todos os campos (vazios quando não informados) e um id. */
export function novoEndereco(parcial = {}) {
  return {
    id: parcial.id || gerarId(10),
    apelido: parcial.apelido || '',
    cep: somenteDigitosCEP(parcial.cep),
    rua: parcial.rua || '',
    numero: parcial.numero || '',
    complemento: parcial.complemento || '',
    bairro: parcial.bairro || '',
    cidade: parcial.cidade || '',
    uf: (parcial.uf || '').toUpperCase(),
    lat: Number.isFinite(parcial.lat) ? parcial.lat : null,
    lng: Number.isFinite(parcial.lng) ? parcial.lng : null,
  };
}

/** "Rua das Flores, 120, apto 4 · Jardim América · São Paulo/SP" */
export function linhaDoEndereco(e) {
  if (!e) return '';
  const rua = [e.rua, e.numero].filter(Boolean).join(', ');
  const ruaComplemento = e.complemento ? `${rua}, ${e.complemento}` : rua;
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join('/');
  return [ruaComplemento, e.bairro, cidadeUf].filter(Boolean).join(' · ');
}

/** "Rua das Flores, 120 · Jardim América" (para cartões pequenos). */
export function linhaCurtaDoEndereco(e) {
  if (!e) return '';
  return [[e.rua, e.numero].filter(Boolean).join(', '), e.bairro].filter(Boolean).join(' · ');
}

/** Texto usado para procurar o endereço nos mapas (se tiver coordenadas, elas são mais precisas). */
export function consultaParaMapa(e) {
  if (Number.isFinite(e?.lat) && Number.isFinite(e?.lng)) return `${e.lat},${e.lng}`;
  const rua = [e.rua, e.numero].filter(Boolean).join(' ');
  const cidade = [e.cidade, e.uf].filter(Boolean).join(' - ');
  return [rua, e.bairro, cidade, 'Brasil'].filter(Boolean).join(', ');
}

/**
 * Opções da janela "Ir até o cliente": o técnico escolhe o aplicativo.
 * Retorna [{ id, rotulo, href }]. Todos funcionam no Android.
 */
export function opcoesDeNavegacao(e) {
  const consulta = consultaParaMapa(e);
  const codificada = encodeURIComponent(consulta);
  const temCoordenadas = Number.isFinite(e?.lat) && Number.isFinite(e?.lng);
  return [
    { id: 'google', rotulo: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${codificada}&travelmode=driving` },
    {
      id: 'waze',
      rotulo: 'Waze',
      href: temCoordenadas
        ? `https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes`
        : `https://waze.com/ul?q=${codificada}&navigate=yes`,
    },
    { id: 'geo', rotulo: 'Outro aplicativo de mapas', href: `geo:0,0?q=${codificada}` },
  ];
}

/** Monta um endereço a partir da resposta do ViaCEP. */
export function enderecoDoViaCep(resposta) {
  return {
    cep: somenteDigitosCEP(resposta.cep),
    rua: resposta.logradouro || '',
    bairro: resposta.bairro || '',
    cidade: resposta.localidade || '',
    uf: resposta.uf || '',
    complemento: '',
  };
}

/** Monta um endereço a partir da resposta do Nominatim (OpenStreetMap), usada pela localização. */
export function enderecoDoNominatim(resposta) {
  const a = resposta?.address || {};
  const iso = a['ISO3166-2-lvl4'] || '';
  return {
    cep: somenteDigitosCEP(a.postcode),
    rua: a.road || a.pedestrian || a.footway || '',
    numero: a.house_number || '',
    bairro: a.suburb || a.neighbourhood || a.quarter || '',
    cidade: a.city || a.town || a.village || a.municipality || '',
    uf: iso.startsWith('BR-') ? iso.slice(3) : '',
    lat: Number.isFinite(Number(resposta?.lat)) ? Number(resposta.lat) : null,
    lng: Number.isFinite(Number(resposta?.lon)) ? Number(resposta.lon) : null,
  };
}
