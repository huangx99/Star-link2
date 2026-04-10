# SFX Assets

这是一套可替换的通用 8-bit 音效资产目录。

## 规则

- 文件名就是事件 key，后续替换时优先保持同名。
- 当前统一为单声道 `wav`，`22050Hz`，方便网页直接加载。
- 如果后面接入音频管理器，建议只引用 `manifest.json` 里的 `key`，不要在代码里写死文件名。

## 当前事件

- `ui-hover`
- `ui-confirm`
- `ui-cancel`
- `card-pickup`
- `card-play`
- `hit-light`
- `hit-heavy`
- `shield-gain`
- `energy-gain`
- `buff-apply`
- `debuff-apply`
- `turn-end`
- `boss-skill`

## 重新生成

```bash
python3 tools/generate_sfx.py
```

## 替换建议

- 保留同名文件直接覆盖，现有事件映射就不需要改。
- 如果想增加事件，先加到 `manifest.json`，再决定是否让前端引用。
