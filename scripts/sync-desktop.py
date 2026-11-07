#!/usr/bin/env python3
import filecmp
import os
import shutil
import sys

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP = os.path.abspath(os.path.join(WEB, '..', 'kanban-desktop'))
LINUX_APP = os.path.join(DESKTOP, 'linux', 'app')
WIN_APP = os.path.join(DESKTOP, 'windows', 'app', 'app')
LINUX_ROOT = os.path.join(DESKTOP, 'linux')
WIN_ROOT = os.path.join(DESKTOP, 'windows')

COMMON = [
    'ai-opencode.json', 'assist-cli.js', 'assist.js', 'console.js', 'course.js',
    'games.js', 'gh.js', 'messages.js', 'movies.js', 'music.js', 'news.js',
    'notify.js', 'ops.js', 'sandbox.js', 'smart.js', 'sounds.js',
    'telegram-bot.js', 'updater.js', 'youtube.js', 'history-collect.py'
]
DIRS = ['public', 'kurs', 'stt']

START = "const ROOT = __dirname;"
END = "const assist = require('./assist')"


def changed(src, dst):
    if not os.path.exists(dst):
        return True
    if os.path.isdir(src):
        return False
    return not filecmp.cmp(src, dst, shallow=False)


def copy_file(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if changed(src, dst):
        shutil.copy2(src, dst)
        print('  ~', os.path.relpath(dst, DESKTOP))


def copy_dir(src, dst):
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        out = dst if rel == '.' else os.path.join(dst, rel)
        os.makedirs(out, exist_ok=True)
        for name in files:
            copy_file(os.path.join(root, name), os.path.join(out, name))


def merge_server(web_path, desk_path):
    with open(web_path, 'r', encoding='utf-8') as f:
        web = f.read()
    with open(desk_path, 'r', encoding='utf-8') as f:
        desk = f.read()
    try:
        wi = web.index(START)
        wj = web.index(END, wi)
        di = desk.index(START)
        dj = desk.index(END, di)
    except ValueError:
        print('  !! cannot find server header markers, skip merge')
        return
    merged = web[:wi] + desk[di:dj] + web[wj:]
    for marker in ('sandbox', 'updater', 'apply-rows', 'gh-repos'):
        if marker not in merged and marker in web:
            print('  !! merged server.js lost marker:', marker)
            return
    if merged != desk:
        with open(desk_path, 'w', encoding='utf-8') as f:
            f.write(merged)
        print('  ~', os.path.relpath(desk_path, DESKTOP))


def sync_target(app_dir, label, root_dir=None):
    print('== %s ==' % label)
    for name in COMMON:
        src = os.path.join(WEB, name)
        if not os.path.exists(src):
            print('  ! missing in web:', name)
            continue
        copy_file(src, os.path.join(app_dir, name))
    for name in DIRS:
        src = os.path.join(WEB, name)
        if os.path.isdir(src):
            copy_dir(src, os.path.join(app_dir, name))
    merge_server(os.path.join(WEB, 'server.js'), os.path.join(app_dir, 'server.js'))
    if root_dir:
        copy_file(os.path.join(WEB, 'preload.js'), os.path.join(root_dir, 'preload.js'))


def main():
    if not os.path.isdir(DESKTOP):
        print('desktop repo not found:', DESKTOP)
        return 1
    sync_target(LINUX_APP, 'linux/app', LINUX_ROOT)
    sync_target(WIN_APP, 'windows/app/app', WIN_ROOT)
    copy_file(os.path.join(WEB, 'history-collect.py'), os.path.join(os.path.join(DESKTOP, 'windows', 'app'), 'history-collect.py'))
    print('done')
    return 0


if __name__ == '__main__':
    sys.exit(main())
