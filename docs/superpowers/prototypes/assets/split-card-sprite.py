#!/usr/bin/env python3
"""
카드 스프라이트를 개별 SVG 52장으로 되돌린다 (앱 배포용).

`build-card-sprite.py` 의 역함수다. 프로토타입은 file:// 로 열려야 해서 스프라이트를
문서에 인라인했지만, 앱에는 그 제약이 없다. 그리고 **외부 SVG 를 `<use>` 로 부르는 것을
Chromium 이 지원하지 않아** 스프라이트를 쓰려면 JS 로 받아 DOM 에 주입해야 하는데,
그건 "인라인 1.6MB 금지"(설계 §8)를 우회로 되살리는 꼴이다.

개별 파일이면 `<img src="/cards/AS.svg">` 하나로 끝나고, 한 문제에 실제로 뜬 카드만
받는다 (문제당 15장 ≈ gzip 100KB. 스프라이트는 첫 화면에 303KB 를 전부 낸다).

출처: Wikimedia Commons "English pattern" 덱 (Dmitry Fomin, CC0 1.0).

사용:
  python split-card-sprite.py cards.sprite.svg <출력디렉터리>
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

SYMBOL = re.compile(
    r'<symbol id="c-([A-Z0-9]{2})" viewBox="([^"]+)">(.*?)</symbol>', re.S
)

EXPECTED = 52

# Inkscape 편집 메타데이터. 그리기에는 쓰이지 않는다.
#
# `build-card-sprite.py` 가 xmlns:inkscape 선언을 지웠는데(루트에만 필요하다고 봤다),
# 이 노드들이 접두사를 그대로 쓰고 있다. 스프라이트는 HTML 안에 인라인되므로
# 관대한 HTML 파서가 조용히 넘어갔지만, **개별 .svg 파일은 엄격한 XML 로 파싱된다** —
# 선언 없는 접두사 하나면 파일 전체가 파싱 실패하고 <img> 는 빈 칸이 된다.
# 52장 중 41장이 여기 걸렸다 (2026-08-31 실측).
INKSCAPE_NODE = re.compile(r'<inkscape:[\w.-]+\b[^>]*?/>|<inkscape:([\w.-]+)\b.*?</inkscape:\1>', re.S)
PREFIXED_ATTR = re.compile(r'\s(?:inkscape|sodipodi):[\w.-]+="[^"]*"')
EMPTY_DEFS = re.compile(r'<defs\s*>\s*</defs>|<defs\s*/>')


def clean(body: str) -> str:
    """선언되지 않은 접두사를 쓰는 노드·속성을 걷어낸다."""
    prev = None
    while prev != body:
        prev = body
        body = INKSCAPE_NODE.sub('', body)
    body = PREFIXED_ATTR.sub('', body)
    return EMPTY_DEFS.sub('', body)


def main(sprite_path: str, out_dir: str) -> None:
    sprite = open(sprite_path, encoding='utf-8').read()
    found = SYMBOL.findall(sprite)
    if len(found) != EXPECTED:
        raise SystemExit('심볼 %d개 — %d개여야 한다' % (len(found), EXPECTED))

    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for code, viewbox, body in found:
        # viewBox 를 그대로 옮긴다. 원본 캔버스가 360×540 이라 가로세로비가 1.5 다 —
        # 카드 박스를 1.42 로 잡으면 그림이 눌린다.
        doc = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>'
            % (viewbox, clean(body))
        )
        # 엄격한 XML 로 다시 읽어 본다. 여기서 통과하지 못하면 브라우저에서도 빈 칸이다.
        ET.fromstring(doc)
        path = os.path.join(out_dir, code + '.svg')
        open(path, 'w', encoding='utf-8', newline='').write(doc)
        total += len(doc)

    print('카드 %d장 · 합계 %d bytes → %s' % (len(found), total, out_dir))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
