#!/usr/bin/env python3
"""
CC0 카드 SVG 52장을 인라인 스프라이트 하나로 합친다.

출처: Wikimedia Commons "English pattern" 덱 (Dmitry Fomin, CC0 1.0).
프로토타입은 file:// 로 열리는 단일 HTML 이라 외부 스프라이트를 <use> 로 못 부른다
(파일 스킴에서 CORS 로 막힌다). 그래서 문서 안에 인라인할 조각을 만든다.

원본은 Inkscape 출력이라 id 가 파일마다 겹치지만(svg20298·layer1·logo …),
xlink:href 도 url(#…) 도 없어서 참조가 아니다 — 접두어를 붙일 필요 없이 지우면 된다.

사용:
  python build-card-sprite.py <원본디렉터리> <출력.svg>
  원본 파일명은 랭크+무늬 (AS, TD, 2C …)
"""
import os, re, sys

RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
SUITS = ['S','H','D','C']

def trim_path(m: 're.Match') -> str:
    """
    패스 좌표를 소수점 2자리로 자른다. 360×540 캔버스에서 0.01 은 0.003% 라
    눈에 보이지 않고, Inkscape 가 남긴 자릿수가 스프라이트 용량의 대부분이다.
    """
    def num(t):
        v = round(float(t.group()), 2)
        return ('%g' % v)
    return ' d="' + re.sub(r'-?\d+\.\d+', num, m.group(1)) + '"'


def inner(svg: str) -> str:
    """루트 <svg> 안쪽만 꺼내 쓸 수 있는 조각으로 만든다."""
    body = svg[svg.index('>', svg.index('<svg')) + 1 : svg.rindex('</svg>')]
    body = re.sub(r'<\?xml.*?\?>', '', body, flags=re.S)
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'<metadata\b.*?</metadata>', '', body, flags=re.S)
    body = re.sub(r'<defs\b[^>]*/>', '', body)                 # 빈 defs
    body = re.sub(r'\s+id="[^"]*"', '', body)                  # 참조 없는 id
    body = re.sub(r'\s+xmlns:[a-zA-Z]+="[^"]*"', '', body)     # 루트에만 필요
    body = re.sub(r'\s*\n\s*', ' ', body)                      # 속성 줄바꿈 접기
    body = re.sub(r'\sd="([^"]*)"', trim_path, body)           # 좌표 소수점 정리
    return re.sub(r'>\s+<', '><', body).strip()

def main(src: str, out: str) -> None:
    parts, missing, total = [], [], 0
    for s in SUITS:
        for r in RANKS:
            code = r + s
            path = os.path.join(src, code + '.svg')
            if not os.path.exists(path):
                missing.append(code); continue
            raw = open(path, encoding='utf-8').read()
            if '<svg' not in raw:
                missing.append(code); continue
            total += len(raw)
            parts.append('<symbol id="c-%s" viewBox="0 0 360 540">%s</symbol>' % (code, inner(raw)))
    if missing:
        raise SystemExit('빠진 카드 %d장: %s' % (len(missing), ' '.join(missing)))
    sprite = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'
              + ''.join(parts) + '</svg>')
    open(out, 'w', encoding='utf-8', newline='').write(sprite)
    print('카드 %d장 · 원본 %d → 스프라이트 %d bytes (%.0f%%)'
          % (len(parts), total, len(sprite), 100 * len(sprite) / total))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
