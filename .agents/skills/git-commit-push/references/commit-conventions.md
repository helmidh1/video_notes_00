# Conventional Commits Reference Guide

This repository follows the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) specification for clear, readable, and automated changelog-ready history.

---

## 1. Format Specification

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Examples
- `feat(sidepanel): add live caption deduplication and streaming tab`
- `fix(background): resolve captureVisibleTab windowId overload error`
- `test(noteMerge): cover strict timestamp ordering and ISO isolation`
- `docs(readme): add installation guide for companion caption bridge`
- `refactor(vaultStorage): streamline permission query handling`

---

## 2. Common Scopes in This Codebase

| Scope | Files / Subsystems |
| :--- | :--- |
| `sidepanel` | `entrypoints/sidepanel/*`, React components, styles, modals |
| `background` | `entrypoints/background.ts`, service worker, CORS fallback |
| `content` | `entrypoints/content.ts`, player observers, DOM injectors |
| `companion` | `companion/*`, Python Live Caption WebSocket bridge |
| `vault` | `utils/vaultStorage.ts`, `utils/noteMerge.ts`, File System Access |
| `ai` | `utils/geminiClient.ts`, multimodal prompt generation |
| `test` | `tests/*`, Vitest specs and test helpers |
| `config` | `wxt.config.ts`, `tsconfig.json`, `package.json` |

---

## 3. Best Practices

1. **Imperative Mood**: Use "add", "fix", "update", "refactor" instead of "added", "fixing", "updates".
2. **No Trailing Period**: Do not end the first summary line with a period.
3. **Lowercase Type**: Keep type lowercase (`feat:`, `fix:`, `chore:`).
4. **Safety Check**: Never commit secret keys, private credentials, or debug scratch files.
