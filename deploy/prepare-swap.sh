#!/usr/bin/env bash
set -euo pipefail
if [[ $(id -u) -ne 0 ]]; then
  echo 'Run this helper with sudo.' >&2
  exit 1
fi
swap_path=/swapfile.onesystemserp
if [[ ! -e "$swap_path" ]]; then
  fallocate -l 4G "$swap_path"
  chmod 600 "$swap_path"
  mkswap "$swap_path"
fi
if ! swapon --noheadings --show=NAME | grep -Fxq "$swap_path"; then
  swapon "$swap_path"
fi
if ! grep -Fq "$swap_path " /etc/fstab; then
  cp -a /etc/fstab "/etc/fstab.onesystemserp-backup-$(date -u +%Y%m%dT%H%M%SZ)"
  printf '%s none swap sw 0 0\n' "$swap_path" >> /etc/fstab
fi
free -h
