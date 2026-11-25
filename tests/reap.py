#!/usr/bin/env python3
"""Run a command as child-subreaper: every descendant gets reaped, all are killed at the end.
usage: reap.py TIMEOUT_SECONDS cmd args..."""
import ctypes, os, signal, sys, time

PR_SET_CHILD_SUBREAPER = 36
ctypes.CDLL(None).prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0)
timeout = float(sys.argv[1])
pid = os.fork()
if pid == 0:
    os.setpgid(0, 0)
    os.execvp(sys.argv[2], sys.argv[2:])
status = 0
deadline = time.time() + timeout
main_done = False
while True:
    try:
        p, st = os.waitpid(-1, os.WNOHANG)
    except ChildProcessError:
        break
    if p == pid:
        main_done = True
        status = os.waitstatus_to_exitcode(st)
    if p == 0:
        if main_done or time.time() > deadline:
            if not main_done:
                print("reap.py: timeout, killing", file=sys.stderr)
            # kill every remaining descendant (they are all our children now or in the group)
            for d in os.listdir("/proc"):
                if d.isdigit():
                    try:
                        with open(f"/proc/{d}/stat") as f:
                            ppid = int(f.read().rsplit(")", 1)[1].split()[1])
                        if ppid == os.getpid():
                            os.kill(int(d), signal.SIGKILL)
                    except Exception:
                        pass
            try:
                os.killpg(pid, signal.SIGKILL)
            except Exception:
                pass
        time.sleep(0.05)
sys.exit(status if main_done else 124)
