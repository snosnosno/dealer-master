import sys
import os
# 게시용 페이지를 만든다 — python3 tools/build-artifact.py <출력 폴더>
# Artifact 규칙: <html>/<head>/<body> 를 빼고(게시 때 감싼다), 고정 요소에 폰 노치 · 측면 여백을 더한다.
# 결과는 <출력 폴더>/index.html. game.js · vendor/three.min.js 는 Artifact 게시의 files 로 함께 올린다.
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
s = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html'), encoding='utf8').read()
for a, b in [
 ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">\n<title>홀덤펍 점장</title>\n',
  '<title>홀덤펍 점장</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'),
 ('</style>\n</head>\n<body>\n', '</style>\n'),
 ('</body>\n</html>\n', ''),
 ('  position: fixed; top: 10px; left: 10px; right: 10px; z-index: 10;',
  '  position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); left: max(16px, env(safe-area-inset-left, 0px)); right: max(16px, env(safe-area-inset-right, 0px)); z-index: 10;'),
 ('  position: fixed; right: 10px; top: 70px; width: 270px; z-index: 10;',
  '  position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); top: calc(70px + env(safe-area-inset-top, 0px)); width: 270px; z-index: 10;'),
 ('  position: fixed; left: 10px; bottom: 10px; z-index: 10;',
  '  position: fixed; left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 10;'),
 ('  .calls { top: auto; bottom: 10px; right: 10px; left: 10px; width: auto; max-height: 30%; }',
  '  .calls { top: auto; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); right: max(16px, env(safe-area-inset-right, 0px)); left: max(16px, env(safe-area-inset-left, 0px)); width: auto; max-height: 30%; }'),
 ('display: flex; align-items: center; justify-content: center; padding: 16px;',
  'display: flex; align-items: center; justify-content: center;\n  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));'),
]:
    assert a in s, a[:60]
    s = s.replace(a, b)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(s)
print('built', len(s))
