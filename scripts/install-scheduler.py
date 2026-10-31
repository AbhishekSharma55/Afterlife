#!/usr/bin/env python3
"""Install one quota-aware cron runner; preserve unrelated user jobs."""
from pathlib import Path
import shlex
import shutil
import subprocess
import time

root = Path(__file__).resolve().parent.parent
state = root / '.afterlife'
state.mkdir(exist_ok=True)
values = {'AFTERLIFE_NODE': shutil.which('node'), 'AFTERLIFE_CODEX': shutil.which('codex')}
if not all(values.values()):
    raise SystemExit('Node and Codex must be installed.')
config = state / 'runner.env'
config.write_text(''.join(f'{key}={shlex.quote(value)}\n' for key, value in values.items()))
config.chmod(0o600)
(state / 'last-attempt').write_text(str(int(time.time())))
(state / 'parent-active').touch()
existing = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
if existing.returncode not in (0, 1):
    raise SystemExit('Could not read existing crontab.')
tag = '# afterlife-backend-autonomy'
lines = [line for line in existing.stdout.splitlines() if tag not in line]
lines.append(f'* * * * * /bin/bash {shlex.quote(str(root / "scripts/autonomous-run.sh"))} {tag}')
subprocess.run(['crontab', '-'], input='\n'.join(lines)+'\n', text=True, check=True)
print('Installed one cron job: minute heartbeat, ten-minute quota checks, serialized sessions.')
