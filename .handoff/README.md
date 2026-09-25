# Combat audit v1.1 handoff

This branch carries the exact source/doc patch from local commit `7347f82`, based on `5451ab1eea86927475b58d1906059812b3f6b887`.

The generated `index.html` and `룬미드가츠_v9.19.html` are intentionally excluded. After applying, regenerate them with `python3 build.py`.

## Restore

```bash
base64 -d .handoff/combat-audit-v1.1.patch.gz.b64.part01 > /tmp/combat-audit-v1.1.patch.gz
base64 -d .handoff/combat-audit-v1.1.patch.gz.b64.part02 >> /tmp/combat-audit-v1.1.patch.gz
base64 -d .handoff/combat-audit-v1.1.patch.gz.b64.part03 >> /tmp/combat-audit-v1.1.patch.gz
base64 -d .handoff/combat-audit-v1.1.patch.gz.b64.part04 >> /tmp/combat-audit-v1.1.patch.gz
sha256sum /tmp/combat-audit-v1.1.patch.gz
# expected: fd820edc53873aac8854afca1c09db9fe64ba3b748edd13f2cec9cac4abb4091
gzip -dc /tmp/combat-audit-v1.1.patch.gz > /tmp/combat-audit-v1.1.patch
git apply --check /tmp/combat-audit-v1.1.patch
git apply /tmp/combat-audit-v1.1.patch
python3 build.py
```

See `COMBAT_PATCH_NOTES.md`, `MONSTER_AI_AUDIT.md`, and the v1.13 plan after applying. Do not include the unrelated pre-existing `versions/룬미드가츠_v9.15.html` change.