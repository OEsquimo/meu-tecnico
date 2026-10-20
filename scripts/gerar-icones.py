#!/usr/bin/env python3
"""
GERAR ÍCONES DO APLICATIVO
==========================
Cria os ícones PNG (um floco de neve branco sobre fundo azul) usados pelo
manifesto do PWA e pelo atalho na tela inicial do Android.

Como rodar (precisa da biblioteca Pillow: pip install pillow):
    python3 scripts/gerar-icones.py

Para trocar o visual, edite as cores/desenho aqui e rode de novo.
"""
import math
import os
from PIL import Image, ImageDraw

AZUL = (11, 110, 153, 255)
BRANCO = (255, 255, 255, 255)
PASTA = os.path.join(os.path.dirname(__file__), '..', 'public', 'icones')


def desenhar(tamanho, mascaravel=False):
    """Desenha o ícone. Se 'mascaravel', deixa margem de segurança (Android recorta em círculo)."""
    escala = 4  # desenha grande e reduz depois, para as bordas ficarem suaves
    t = tamanho * escala
    img = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if mascaravel:
        d.rectangle([0, 0, t, t], fill=AZUL)  # fundo cheio; o Android aplica a máscara
        raio_floco = t * 0.30
    else:
        d.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(t * 0.22), fill=AZUL)
        raio_floco = t * 0.36
    cx = cy = t / 2
    largura = max(2, int(t * 0.045))
    for i in range(6):
        ang = math.radians(60 * i - 90)
        fx = cx + raio_floco * math.cos(ang)
        fy = cy + raio_floco * math.sin(ang)
        d.line([cx, cy, fx, fy], fill=BRANCO, width=largura)
        # dois "galhinhos" em cada ponta do floco
        for lado in (-1, 1):
            gx = cx + raio_floco * 0.68 * math.cos(ang)
            gy = cy + raio_floco * 0.68 * math.sin(ang)
            ang2 = ang + lado * math.radians(45)
            d.line([gx, gy, gx + raio_floco * 0.25 * math.cos(ang2), gy + raio_floco * 0.25 * math.sin(ang2)],
                   fill=BRANCO, width=largura)
    return img.resize((tamanho, tamanho), Image.LANCZOS)


def main():
    os.makedirs(PASTA, exist_ok=True)
    for nome, tam, masc in [
        ('icone-192.png', 192, False),
        ('icone-512.png', 512, False),
        ('icone-mascaravel-512.png', 512, True),
        ('icone-apple-180.png', 180, True),
        ('favicon-32.png', 32, False),
    ]:
        desenhar(tam, masc).save(os.path.join(PASTA, nome))
        print('criado', nome)


if __name__ == '__main__':
    main()
