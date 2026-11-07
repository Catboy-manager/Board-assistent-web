#!/usr/bin/env python3
import json
import os
import shutil
import sqlite3
import sys
import tempfile

LIMIT_PER_DB = 4000
LIMIT_TOTAL = 20000


def home():
    return os.path.expanduser('~')


def chrome_roots():
    h = home()
    if sys.platform == 'win32':
        local = os.environ.get('LOCALAPPDATA', '')
        roaming = os.environ.get('APPDATA', '')
        return [
            os.path.join(local, 'Google', 'Chrome', 'User Data'),
            os.path.join(local, 'Chromium', 'User Data'),
            os.path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
            os.path.join(local, 'Microsoft', 'Edge', 'User Data'),
            os.path.join(local, 'Vivaldi', 'User Data'),
            os.path.join(roaming, 'Opera Software', 'Opera Stable'),
        ]
    if sys.platform == 'darwin':
        base = os.path.join(h, 'Library', 'Application Support')
        return [
            os.path.join(base, 'Google', 'Chrome'),
            os.path.join(base, 'Chromium'),
            os.path.join(base, 'BraveSoftware', 'Brave-Browser'),
            os.path.join(base, 'Microsoft Edge'),
            os.path.join(base, 'Vivaldi'),
            os.path.join(base, 'Opera Software', 'Opera Stable'),
        ]
    return [
        os.path.join(h, '.config', 'google-chrome'),
        os.path.join(h, '.config', 'chromium'),
        os.path.join(h, '.config', 'BraveSoftware', 'Brave-Browser'),
        os.path.join(h, '.config', 'microsoft-edge'),
        os.path.join(h, '.config', 'vivaldi'),
        os.path.join(h, '.config', 'opera'),
        os.path.join(h, 'snap', 'chromium', 'common', 'chromium'),
        os.path.join(h, 'snap', 'brave', 'current', '.config', 'BraveSoftware', 'Brave-Browser'),
        os.path.join(h, '.var', 'app', 'org.chromium.Chromium', 'config', 'chromium'),
    ]


def firefox_roots():
    h = home()
    if sys.platform == 'win32':
        return [os.path.join(os.environ.get('APPDATA', ''), 'Mozilla', 'Firefox', 'Profiles')]
    if sys.platform == 'darwin':
        return [os.path.join(h, 'Library', 'Application Support', 'Firefox', 'Profiles')]
    return [
        os.path.join(h, '.mozilla', 'firefox'),
        os.path.join(h, 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
        os.path.join(h, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'),
    ]


def chrome_profiles(root):
    out = []
    if not os.path.isdir(root):
        return out
    if os.path.isfile(os.path.join(root, 'History')):
        out.append(root)
        return out
    try:
        for name in os.listdir(root):
            p = os.path.join(root, name)
            if name in ('System Profile', 'Guest Profile', 'Crashpad'):
                continue
            if os.path.isdir(p) and os.path.isfile(os.path.join(p, 'History')):
                out.append(p)
    except OSError:
        pass
    return out


def firefox_profiles(root):
    out = []
    if not os.path.isdir(root):
        return out
    try:
        for name in os.listdir(root):
            p = os.path.join(root, name)
            if os.path.isdir(p) and os.path.isfile(os.path.join(p, 'places.sqlite')):
                out.append(p)
    except OSError:
        pass
    return out


def copy_sqlite(src):
    tmp = tempfile.mkdtemp(prefix='kban-history-')
    dst = os.path.join(tmp, os.path.basename(src))
    shutil.copy2(src, dst)
    for suffix in ('-wal', '-shm'):
        extra = src + suffix
        if os.path.isfile(extra):
            try:
                shutil.copy2(extra, dst + suffix)
            except OSError:
                pass
    return tmp, dst


def read_chrome(path):
    tmp, db = copy_sqlite(path)
    rows = []
    try:
        con = sqlite3.connect('file:' + db + '?mode=ro', uri=True, timeout=5)
        cur = con.execute(
            "SELECT url, title FROM urls WHERE url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ?",
            (LIMIT_PER_DB,)
        )
        for url, title in cur:
            if url:
                rows.append((url, title or ''))
        con.close()
    except Exception:
        pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return rows


def read_firefox(path):
    tmp, db = copy_sqlite(path)
    rows = []
    try:
        con = sqlite3.connect('file:' + db + '?mode=ro', uri=True, timeout=5)
        cur = con.execute(
            "SELECT url, title FROM moz_places WHERE url LIKE 'http%' ORDER BY last_visit_date DESC LIMIT ?",
            (LIMIT_PER_DB,)
        )
        for url, title in cur:
            if url:
                rows.append((url, title or ''))
        con.close()
    except Exception:
        pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return rows


def main():
    seen = set()
    rows = []
    sources = []
    for root in chrome_roots():
        for profile in chrome_profiles(root):
            got = read_chrome(os.path.join(profile, 'History'))
            if got:
                sources.append('chrome:' + os.path.basename(profile))
                for url, title in got:
                    if url in seen:
                        continue
                    seen.add(url)
                    rows.append({'url': url, 'title': title[:300]})
                    if len(rows) >= LIMIT_TOTAL:
                        break
            if len(rows) >= LIMIT_TOTAL:
                break
        if len(rows) >= LIMIT_TOTAL:
            break
    if len(rows) < LIMIT_TOTAL:
        for root in firefox_roots():
            for profile in firefox_profiles(root):
                got = read_firefox(os.path.join(profile, 'places.sqlite'))
                if got:
                    sources.append('firefox:' + os.path.basename(profile))
                    for url, title in got:
                        if url in seen:
                            continue
                        seen.add(url)
                        rows.append({'url': url, 'title': title[:300]})
                        if len(rows) >= LIMIT_TOTAL:
                            break
                if len(rows) >= LIMIT_TOTAL:
                    break
            if len(rows) >= LIMIT_TOTAL:
                break

    if not rows:
        print(json.dumps({'ok': False, 'error': 'no browser history db found', 'rows': [], 'sources': sources}, ensure_ascii=False))
        return 0
    print(json.dumps({'ok': True, 'rows': rows, 'sources': sources, 'count': len(rows)}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc), 'rows': [], 'sources': []}, ensure_ascii=False))
        sys.exit(0)
