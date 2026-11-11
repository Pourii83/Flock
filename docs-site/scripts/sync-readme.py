"""Splits README.md / README.fa.md into documentation pages, so the docs never drift from the README.

    python docs-site/scripts/sync-readme.py

The two READMEs share one section order; each ##/### section is mapped by position to a page below.
Generated pages carry a notice; edit the README and run this again. demo.md is written by hand.
"""
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs-site' / 'src' / 'content' / 'docs'
PUBLIC = ROOT / 'docs-site' / 'public'
REPO = 'https://github.com/Pourii83/Flock'
# Screenshots are served from the flock-media R2 bucket (Cloudflare), not from the docs site.
MEDIA = 'https://flock.iranset.online'

# Page for each ##/### section, in README order. None = dropped (the table of contents).
SECTIONS = [
    None,                 # Contents
    'index',              # Features (appended to the introduction)
    'quick-start',
    'install',            # Installation
    'install',            # Before you start
    'install/docker',
    'install/script',
    'install/offline',
    'after-installing',
    'configuration',
    'calls',
    'troubleshooting',
    'apps',
    'privacy',
    'development',
    'license',
]
INTRO_TITLE = {'en': 'Introduction', 'fa': 'معرفی'}
FENCE = re.compile(r'^\s*(```|~~~)')
HEADING = re.compile(r'^(#{1,4}) (.+?)\s*$')


def slug(text: str) -> str:
    """github-slugger: lower-case, drop punctuation, spaces to hyphens (as Starlight does)."""
    text = re.sub(r'[`*_]', '', text).strip().lower()
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in ' -':
            out.append('-' if ch == ' ' else ch)
        elif cat[0] in 'LN' or cat == 'Mn' or ch == '‌':
            out.append(ch)
    return ''.join(out)


def plain(text: str) -> str:
    return re.sub(r'[`*]', '', text).strip()


def parse(lines):
    """Returns (preamble, [(level, title, body_lines)]) for ##/### sections; #### stays in the body."""
    preamble, sections, current, in_fence = [], [], None, False
    for line in lines:
        if FENCE.match(line):
            in_fence = not in_fence
        m = None if in_fence else HEADING.match(line)
        if m and len(m.group(1)) in (2, 3):
            current = (len(m.group(1)), m.group(2), [])
            sections.append(current)
        elif current is None:
            preamble.append(line)
        else:
            current[2].append(line)
    return preamble, sections


def build(lang: str):
    src = ROOT / ('README.md' if lang == 'en' else 'README.fa.md')
    preamble, sections = parse(src.read_text(encoding='utf-8').splitlines())
    if len(sections) != len(SECTIONS):
        sys.exit(f'{src.name}: {len(sections)} sections, expected {len(SECTIONS)}; update SECTIONS')
    prefix = '' if lang == 'en' else '/fa'

    # anchor -> page URL, for every heading (including ####) in the README
    anchors = {}
    for (level, title, body), page in zip(sections, SECTIONS):
        if page is None:
            continue
        url = f'{prefix}/' if page == 'index' else f'{prefix}/{page}/'
        first_of_page = SECTIONS.index(page) == sections.index((level, title, body))
        anchors[slug(title)] = url if first_of_page and page != 'index' else f'{url}#{slug(title)}'
        in_fence = False
        for line in body:
            if FENCE.match(line):
                in_fence = not in_fence
            m = None if in_fence else HEADING.match(line)
            if m:
                anchors[slug(m.group(2))] = f'{url}#{slug(m.group(2))}'
    anchors.setdefault('license', f'{prefix}/license/')

    def fix_links(text: str) -> str:
        def anchor(m):
            target = anchors.get(m.group(2))
            if target is None:
                print(f'  {src.name}: unknown anchor #{m.group(2)}', file=sys.stderr)
                return m.group(0)
            return f'{m.group(1)}({target})'
        text = re.sub(r'(\[[^\]]*\])\(#([^)]+)\)', anchor, text)
        text = text.replace('docs/screenshots/', f'{MEDIA}/')
        text = text.replace('apps/client/assets/images/icon.png', '/flock-icon.png')
        # Other relative links point at files in the repository.
        text = re.sub(r'\]\((?!https?:|/|#|mailto:)([^)]+)\)', lambda m: f']({REPO}/blob/main/{m.group(1)})', text)
        return text

    pages = {}
    for (level, title, body), page in zip(sections, SECTIONS):
        if page is None:
            continue
        out = []
        if page in pages:  # a later section on the same page keeps its own heading
            out.append(f'## {title}')
        in_fence = False
        for line in body:
            if FENCE.match(line):
                in_fence = not in_fence
            m = None if in_fence else HEADING.match(line)
            if m:
                depth = max(2, len(m.group(1)) - (level - 1))
                line = f'{"#" * depth} {m.group(2)}'
            out.append(line)
        pages.setdefault(page, {'title': plain(title), 'lines': []})['lines'] += out

    # The introduction: the README's opening (minus logo, title and language links), then Features.
    intro = [l for l in preamble if not l.startswith('# ') and '[فارسی]' not in l and '[English]' not in l
             and '**English**' not in l and '**فارسی**' not in l]
    intro_text = '\n'.join(intro)
    intro_text = re.sub(r'<p align="center">\s*<img src="apps/client[^>]*>\s*</p>', '', intro_text)
    features = pages['index']
    pages['index'] = {'title': INTRO_TITLE[lang], 'lines': intro_text.splitlines() + ['', f'## {features["title"]}'] + features['lines']}

    base = DOCS if lang == 'en' else DOCS / 'fa'
    for page, data in pages.items():
        path = base / f'{page}.md'
        path.parent.mkdir(parents=True, exist_ok=True)
        body = fix_links('\n'.join(data['lines'])).strip('\n')
        source = 'README.md' if lang == 'en' else 'README.fa.md'
        front = f'---\ntitle: "{data["title"]}"\neditUrl: {REPO}/edit/main/{source}\n---\n\n'
        notice = f'<!-- Generated from {source} by docs-site/scripts/sync-readme.py. Edit the README instead. -->\n\n'
        path.write_text(front + notice + body + '\n', encoding='utf-8')
    print(f'{src.name}: {len(pages)} pages')


if __name__ == '__main__':
    shutil.copy2(ROOT / 'apps' / 'client' / 'assets' / 'images' / 'icon.png', PUBLIC / 'flock-icon.png')
    build('en')
    build('fa')
