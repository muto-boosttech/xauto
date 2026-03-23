# クラウドで動かす

**この Mac で Docker を起動する必要はありません。**  
GitHub にコードを置き、**Railway または Render が Dockerfile をビルド**します（ビルドはクラウド側）。

---

## 0. 事前準備

- GitHub アカウント
- [Railway](https://railway.app) または [Render](https://render.com) アカウント
- API キー（Anthropic・X）をメモしておく（`.env` は **push しない** — `.gitignore` 済み）

---

## 1. GitHub に上げる（初回）

ターミナルでプロジェクトフォルダで実行:

```bash
cd /path/to/xauto
git init
git add .
git commit -m "Initial commit: X automation + cloud entry"
```

GitHub で **新しい空のリポジトリ** を作り、表示されたコマンドで push:

```bash
git remote add origin https://github.com/あなたのユーザー名/xauto.git
git branch -M main
git push -u origin main
```

（既に `git init` 済みなら `add` / `commit` / `push` だけでよい）

---

## 2-A. Railway（推奨・手順が短い）

1. [railway.app](https://railway.app) にログイン → **New Project**
2. **Deploy from GitHub repo** → さきほどのリポジトリを選択
3. プロジェクトでサービスを開き **Settings**:
   - **Root Directory**: 空のまま（リポジトリ直下）
   - **Build** が Dockerfile を使う想定（リポジトリに `railway.toml` あり）
4. **Variables** に追加（Raw Editor でも可）:

   | Name | 例 / 説明 |
   |------|-----------|
   | `ANTHROPIC_API_KEY` | Claude 用 |
   | `X_API_KEY` | X API |
   | `X_API_SECRET` | |
   | `X_ACCESS_TOKEN` | |
   | `X_ACCESS_SECRET` | または `X_ACCESS_TOKEN_SECRET` |
   | `REVIEW_UI_TOKEN` | **長いランダム文字列（必須級）** |
   | `DATA_DIR` | `/data` |
   | `PUBLIC_BASE_URL` | 下の手順 5 のあとで設定 |
   | `XAUTO_UI_ALLOW_GENERATE` | `1`（ブラウザから5案生成する場合） |

5. **Volumes** タブ → **Add Volume** → Mount Path を **`/data`**
6. **Settings → Networking → Generate Domain** で HTTPS URL を発行
7. **Variables** の `PUBLIC_BASE_URL` を、その URL に更新（**末尾スラッシュなし**）→ 再デプロイが走る場合あり
8. ブラウザで次を開く（`TOKEN` は `REVIEW_UI_TOKEN` の値）:

   `https://（発行されたドメイン）/?token=TOKEN`

`PORT` は Railway が自動注入するため **設定不要**です。

---

## 2-B. Render（Blueprint または手動）

### Blueprint で作る場合

1. Render ダッシュボード → **New** → **Blueprint**
2. リポジトリを接続し `render.yaml` を検出させる
3. 作成後、サービスの **Environment** で **Secret** として次を追加:
   - `ANTHROPIC_API_KEY`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`
   - `REVIEW_UI_TOKEN`, `PUBLIC_BASE_URL`（デプロイ後に発行した URL）
   - 必要なら `XAUTO_UI_ALLOW_GENERATE=1`
4. **Disk** が付いていれば Mount `/data` と `DATA_DIR=/data` を確認（無料プランではディスク不可のことがあります。その場合は**再デプロイで DB が消える**点に注意）

### 手動で Web Service を作る場合

- **New** → **Web Service** → リポジトリ選択
- **Environment** → **Docker**
- Dockerfile のパス: `Dockerfile`
- **Advanced** → **Add Disk** → Mount path **`/data`**
- 環境変数は上表と同様 + `HOST=0.0.0.0`, `DATA_DIR=/data`

---

## 前提（SQLite）

- **永続ディスク**を `/data` にマウントし、`DATA_DIR=/data` にすると、投稿履歴・DB が残ります。
- ディスクなしだと、**再デプロイのたびに SQLite が空**になります。

---

## オプション環境変数

| 変数 | 説明 |
|------|------|
| `CLOUD_AUTO_POST_LEGACY_SLOTS=1` | `schedule.json` の `slots` による自動投稿（通常は不要） |
| `REPORTS_DIR` | レポート出力先 |

---

## ローカルで Docker を使う場合（参考）

```bash
docker build -t xauto .
docker run --rm -p 3847:3847 -e DATA_DIR=/data -v xauto-data:/data \
  -e ANTHROPIC_API_KEY=... -e X_API_KEY=... （省略） \
  -e REVIEW_UI_TOKEN=test -e PUBLIC_BASE_URL=http://127.0.0.1:3847 \
  xauto
```
